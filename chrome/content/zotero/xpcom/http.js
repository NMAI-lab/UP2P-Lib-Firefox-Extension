/**
 * Functions for performing HTTP requests, both via XMLHTTPRequest and using a hidden browser
 * @namespace
 */
Zotero.HTTP = new function() {
	this.WebDAV = {};
	
	
	/**
	* Send an HTTP GET request via XMLHTTPRequest
	* 
	* @param {nsIURI|String}	url				URL to request
	* @param {Function} 		onDone			Callback to be executed upon request completion
	* @param {String} 		responseCharset	Character set to force on the response
	* @param {Zotero.CookieSandbox} [cookieSandbox] Cookie sandbox object
	* @return {Boolean} True if the request was sent, or false if the browser is offline
	*/
	this.doGet = function(url, onDone, responseCharset, cookieSandbox) {
		if (url instanceof Components.interfaces.nsIURI) {
			// Don't display password in console
			var disp = url.clone();
			if (disp.password) {
				disp.password = "********";
			}
			Zotero.debug("HTTP GET " + disp.spec);
			url = url.spec;
		}
		else {
			Zotero.debug("HTTP GET " + url);
		}
		if (this.browserIsOffline()){
			return false;
		}
		
		// Workaround for "Accept third-party cookies" being off in Firefox 3.0.1
		// https://www.zotero.org/trac/ticket/1070
		if (Zotero.isFx30) {
			const Cc = Components.classes;
			const Ci = Components.interfaces;
			var ds = Cc["@mozilla.org/webshell;1"].
						createInstance(Components.interfaces.nsIDocShellTreeItem).
						QueryInterface(Ci.nsIInterfaceRequestor);
			ds.itemType = Ci.nsIDocShellTreeItem.typeContent;
			var xmlhttp = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].
							createInstance(Ci.nsIXMLHttpRequest);
			xmlhttp.mozBackgroundRequest = true;
			xmlhttp.open("GET", url, true);
			xmlhttp.channel.loadGroup = ds.getInterface(Ci.nsILoadGroup);
			xmlhttp.channel.loadFlags |= Ci.nsIChannel.LOAD_DOCUMENT_URI;
		}
		else {
			var xmlhttp = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"]
							.createInstance();
			// Prevent certificate/authentication dialogs from popping up
			xmlhttp.mozBackgroundRequest = true;
			xmlhttp.open('GET', url, true);
			// Send cookie even if "Allow third-party cookies" is disabled (>=Fx3.6 only)
			if (!Zotero.isFx35) {
				var channel = xmlhttp.channel;
				channel.QueryInterface(Components.interfaces.nsIHttpChannelInternal);
				channel.forceAllowThirdPartyCookie = true;
			}
		}
		
		// Don't cache GET requests
		xmlhttp.channel.loadFlags |= Components.interfaces.nsIRequest.LOAD_BYPASS_CACHE;
		
		/** @ignore */
		xmlhttp.onreadystatechange = function() {
			_stateChange(xmlhttp, onDone, responseCharset);
		};
		
		if(cookieSandbox) cookieSandbox.attachToXHR(xmlhttp);
		xmlhttp.send(null);
		
		return xmlhttp;
	}
	
	/**
	 * Sends a synchronous POST request with encoding type "mulitpart/form-data" to
	 * the specified URL, and returns the request object after the request has been
	 * sent
	 *
	 * @param {String} url URL to request
	 * @param {String, String}[] A list of name, value pairs that contains any text parameters
     *    that should be sent with the request
	 * @param {String, String, nsIFile}[] A list of name, filename, file tuples that contains any 
	 *    files that should be included with the request body
	 */
	this.doMultipartPost = function(url, textParams, fileParams) {
		
		var httpRequest = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"]
				.createInstance();
				
		// Prepare the MIME POST data
		
		var newline = '\r\n';
		var boundaryString = '5572c28b-dbf9-4fc2-8e30-557e12c70d00';
		var boundary = '--' + boundaryString;
		var requestBody = boundary;
		
		for each(var textParam in textParams) {
			requestBody = requestBody + newline
					+ 'Content-Disposition: form-data; name="' + textParam.name + '"' + newline
					+ newline
					+ textParam.value + newline
					+ boundary;
		}
		
		for each(var fileParam in fileParams) {
			var stream = Components.classes["@mozilla.org/network/file-input-stream;1"]
					.createInstance(Components.interfaces.nsIFileInputStream);
			stream.init(fileParam.file, 0x01, 00004, 1<<2);  // Close on file end
			var bstream =  Components.classes["@mozilla.org/network/buffered-input-stream;1"]
					.getService();
			bstream.QueryInterface(Components.interfaces.nsIBufferedInputStream);
			bstream.init(stream, 1000);
			bstream.QueryInterface(Components.interfaces.nsIInputStream);
			binary = Components.classes["@mozilla.org/binaryinputstream;1"]
					.createInstance(Components.interfaces.nsIBinaryInputStream);
			binary.setInputStream(stream);
			
			// Todo: Filenames may need special processing
			requestBody = requestBody + newline
				+ 'Content-Disposition: form-data; name="' + fileParam.name + '"; filename="'
				+ fileParam.filename + '"' + newline
				+ 'Content-Type: application/octet-stream' + newline
				+ 'Content-Transfer-Encoding: binary' + newline
				+ newline
				+ binary.readBytes(fileParam.file.fileSize) + newline
				+ boundary;
		}
		requestBody = requestBody + "--";
		
		Zotero.debug("\nSTART (length: " + requestBody.length + "):\n" + requestBody + "\nEND\n");
		
		httpRequest.open('POST', url, true);
		httpRequest.setRequestHeader("Content-type", "multipart/form-data; boundary=\"" 
				+ boundaryString + "\"");
		httpRequest.setRequestHeader("Connection", "Keep-Alive");
		httpRequest.setRequestHeader("Accept", "[star]/[star]");
		httpRequest.setRequestHeader("Content-length", requestBody.length);
		httpRequest.sendAsBinary(requestBody);
		return httpRequest;
	}
	
	/**
	* Send an HTTP POST request via XMLHTTPRequest
	*
	* @param {String} url URL to request
	* @param {String} body Request body
	* @param {Function} onDone Callback to be executed upon request completion
	* @param {String} headers Request HTTP headers
	* @param {String} responseCharset Character set to force on the response
	* @param {Zotero.CookieSandbox} [cookieSandbox] Cookie sandbox object
	* @return {Boolean} True if the request was sent, or false if the browser is offline
	*/
	this.doPost = function(url, body, onDone, headers, responseCharset, cookieSandbox) {
		if (url instanceof Components.interfaces.nsIURI) {
			// Don't display password in console
			var disp = url.clone();
			if (disp.password) {
				disp.password = "********";
			}
			url = url.spec;
		}
		
		var bodyStart = body.substr(0, 1024);
		// Don't display sync password or session id in console
		bodyStart = bodyStart.replace(/password=[^&]+/, 'password=********');
		bodyStart = bodyStart.replace(/sessionid=[^&]+/, 'sessionid=********');
		
		Zotero.debug("HTTP POST "
			+ (body.length > 1024 ?
				bodyStart + '... (' + body.length + ' chars)' : bodyStart)
			+ " to " + (disp ? disp.spec : url));
		
		
		if (this.browserIsOffline()){
			return false;
		}
		
		// Workaround for "Accept third-party cookies" being off in Firefox 3.0.1
		// https://www.zotero.org/trac/ticket/1070
		if (Zotero.isFx30) {
			const Cc = Components.classes;
			const Ci = Components.interfaces;
			var ds = Cc["@mozilla.org/webshell;1"].
						createInstance(Components.interfaces.nsIDocShellTreeItem).
						QueryInterface(Ci.nsIInterfaceRequestor);
			ds.itemType = Ci.nsIDocShellTreeItem.typeContent;
			var xmlhttp = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].
							createInstance(Ci.nsIXMLHttpRequest);
			xmlhttp.mozBackgroundRequest = true;
			xmlhttp.open("POST", url, true);
			xmlhttp.channel.loadGroup = ds.getInterface(Ci.nsILoadGroup);
			xmlhttp.channel.loadFlags |= Ci.nsIChannel.LOAD_DOCUMENT_URI;
		}
		else {
			var xmlhttp = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"]
						.createInstance();
			// Prevent certificate/authentication dialogs from popping up
			xmlhttp.mozBackgroundRequest = true;
			xmlhttp.open('POST', url, true);
			// Send cookie even if "Allow third-party cookies" is disabled (>=Fx3.6 only)
			if (!Zotero.isFx35) {
				var channel = xmlhttp.channel;
				channel.QueryInterface(Components.interfaces.nsIHttpChannelInternal);
				channel.forceAllowThirdPartyCookie = true;
			}
		}
		
		if (headers) {
			if (typeof headers == 'string') {
				var msg = "doPost() now takes a headers object rather than a requestContentType -- update your code";
				Zotero.debug(msg, 2);
				Components.utils.reportError(msg);
				headers = {
					"Content-Type": headers
				};
			}
		}
		else {
			headers = {};
		}
		
		if (!headers["Content-Type"]) {
			headers["Content-Type"] = "application/x-www-form-urlencoded";
		}
		
		for (var header in headers) {
			xmlhttp.setRequestHeader(header, headers[header]);
		}
		
		/** @ignore */
		xmlhttp.onreadystatechange = function(){
			_stateChange(xmlhttp, onDone, responseCharset);
		};
		
		if(cookieSandbox) cookieSandbox.attachToXHR(xmlhttp);
		xmlhttp.send(body);
		
		return xmlhttp;
	}
	
	/**
	* Send an HTTP HEAD request via XMLHTTPRequest
	*
	* @param {String} url URL to request
	* @param {Function} onDone Callback to be executed upon request completion
	* @param {Object} requestHeaders HTTP headers to include with request
	* @return {Boolean} True if the request was sent, or false if the browser is offline
	*/
	this.doHead = function(url, onDone, requestHeaders) {
		if (url instanceof Components.interfaces.nsIURI) {
			// Don't display password in console
			var disp = url.clone();
			if (disp.password) {
				disp.password = "********";
			}
			Zotero.debug("HTTP HEAD " + disp.spec);
			url = url.spec;
		}
		else {
			Zotero.debug("HTTP HEAD " + url);
		
		}
		
		if (this.browserIsOffline()){
			return false;
		}
		
		// Workaround for "Accept third-party cookies" being off in Firefox 3.0.1
		// https://www.zotero.org/trac/ticket/1070
		if (Zotero.isFx30) {
			const Cc = Components.classes;
			const Ci = Components.interfaces;
			var ds = Cc["@mozilla.org/webshell;1"].
						createInstance(Components.interfaces.nsIDocShellTreeItem).
						QueryInterface(Ci.nsIInterfaceRequestor);
			ds.itemType = Ci.nsIDocShellTreeItem.typeContent;
			var xmlhttp = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"].
							createInstance(Ci.nsIXMLHttpRequest);
			// Prevent certificate/authentication dialogs from popping up
			xmlhttp.mozBackgroundRequest = true;
			xmlhttp.open("HEAD", url, true);
			xmlhttp.channel.loadGroup = ds.getInterface(Ci.nsILoadGroup);
			xmlhttp.channel.loadFlags |= Ci.nsIChannel.LOAD_DOCUMENT_URI;
		}
		else {
			var xmlhttp = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"]
							.createInstance();
			// Prevent certificate/authentication dialogs from popping up
			xmlhttp.mozBackgroundRequest = true;
			xmlhttp.open('HEAD', url, true);
			// Send cookie even if "Allow third-party cookies" is disabled (>=Fx3.6 only)
			if (!Zotero.isFx35) {
				var channel = xmlhttp.channel;
				channel.QueryInterface(Components.interfaces.nsIHttpChannelInternal);
				channel.forceAllowThirdPartyCookie = true;
			}
		}
		
		if (requestHeaders) {
			for (var header in requestHeaders) {
				xmlhttp.setRequestHeader(header, requestHeaders[header]);
			}
		}
		
		// Don't cache HEAD requests
		xmlhttp.channel.loadFlags |= Components.interfaces.nsIRequest.LOAD_BYPASS_CACHE;
		
		/** @ignore */
		xmlhttp.onreadystatechange = function(){
			_stateChange(xmlhttp, onDone);
		};
		
		xmlhttp.send(null);
		
		return xmlhttp;
	}
	
	/**
	 * Send an HTTP OPTIONS request via XMLHTTPRequest
	 *
	 * @param	{nsIURI}		url
	 * @param	{Function}	onDone
	 * @return	{XMLHTTPRequest}
	 */
	this.doOptions = function (uri, callback) {
		// Don't display password in console
		var disp = uri.clone();
		if (disp.password) {
			disp.password = "********";
		}
		Zotero.debug("HTTP OPTIONS for " + disp.spec);
		
		if (Zotero.HTTP.browserIsOffline()){
			return false;
		}
		
		var xmlhttp = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"]
					.createInstance();
		// Prevent certificate/authentication dialogs from popping up
		xmlhttp.mozBackgroundRequest = true;
		xmlhttp.open('OPTIONS', uri.spec, true);
		/** @ignore */
		xmlhttp.onreadystatechange = function() {
			_stateChange(xmlhttp, callback);
		};
		xmlhttp.send(null);
		return xmlhttp;
	}
	
	//
	// WebDAV methods
	//
	
	/**
	* Send a WebDAV PROP* request via XMLHTTPRequest
	*
	* Returns false if browser is offline
	*
	* @param		{String}		method			PROPFIND or PROPPATCH
	* @param		{nsIURI}		uri
	* @param		{String}		body				XML string
	* @param		{Function}	callback
	* @param		{Object}		requestHeaders	e.g. { Depth: 0 }
	*/
	this.WebDAV.doProp = function (method, uri, body, callback, requestHeaders) {
		switch (method) {
			case 'PROPFIND':
			case 'PROPPATCH':
				break;
			
			default:
				throw ("Invalid method '" + method
					+ "' in Zotero.HTTP.doProp");
		}
		
		if (requestHeaders && requestHeaders.depth != undefined) {
			var depth = requestHeaders.depth;
		}
		
		// Don't display password in console
		var disp = uri.clone();
		if (disp.password) {
			disp.password = "********";
		}
		
		var bodyStart = body.substr(0, 1024);
		Zotero.debug("HTTP " + method + " "
			+ (depth != undefined ? "(depth " + depth + ") " : "")
			+ (body.length > 1024 ?
				bodyStart + "... (" + body.length + " chars)" : bodyStart)
			+ " to " + disp.spec);
		
		if (Zotero.HTTP.browserIsOffline()) {
			Zotero.debug("Browser is offline", 2);
			return false;
		}
		
		var xmlhttp = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"]
						.createInstance();
		// Prevent certificate/authentication dialogs from popping up
		xmlhttp.mozBackgroundRequest = true;
		xmlhttp.open(method, uri.spec, true);
		
		if (requestHeaders) {
			for (var header in requestHeaders) {
				xmlhttp.setRequestHeader(header, requestHeaders[header]);
			}
		}
		
		xmlhttp.setRequestHeader("Content-Type", 'text/xml; charset="utf-8"');
		
		xmlhttp.onreadystatechange = function() {
			_stateChange(xmlhttp, callback);
		};
		
		xmlhttp.send(body);
		return xmlhttp;
	}
	
	
	/**
	 * Send a WebDAV MKCOL request via XMLHTTPRequest
	 *
	 * @param	{nsIURI}		url
	 * @param	{Function}	onDone
	 * @return	{XMLHTTPRequest}
	 */
	this.WebDAV.doMkCol = function (uri, callback) {
		// Don't display password in console
		var disp = uri.clone();
		if (disp.password) {
			disp.password = "********";
		}
		Zotero.debug("HTTP MKCOL " + disp.spec);
		
		if (Zotero.HTTP.browserIsOffline()) {
			return false;
		}
		
		var xmlhttp = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"]
					.createInstance();
		// Prevent certificate/authentication dialogs from popping up
		xmlhttp.mozBackgroundRequest = true;
		xmlhttp.open('MKCOL', uri.spec, true);
		xmlhttp.onreadystatechange = function() {
			_stateChange(xmlhttp, callback);
		};
		xmlhttp.send(null);
		return xmlhttp;
	}
	
	
	/**
	 * Send a WebDAV PUT request via XMLHTTPRequest
	 *
	 * @param	{nsIURI}		url
	 * @param	{String}		body			String body to PUT
	 * @param	{Function}	onDone
	 * @return	{XMLHTTPRequest}
	 */
	this.WebDAV.doPut = function (uri, body, callback) {
		// Don't display password in console
		var disp = uri.clone();
		if (disp.password) {
			disp.password = "********";
		}
		
		var bodyStart = "'" + body.substr(0, 1024) + "'";
		Zotero.debug("HTTP PUT "
			+ (body.length > 1024 ?
				bodyStart + "... (" + body.length + " chars)" : bodyStart)
			+ " to " + disp.spec);
		
		if (Zotero.HTTP.browserIsOffline()) {
			return false;
		}
		
		var xmlhttp = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"]
					.createInstance();
		// Prevent certificate/authentication dialogs from popping up
		xmlhttp.mozBackgroundRequest = true;
		xmlhttp.open("PUT", uri.spec, true);
		// Some servers (e.g., Jungle Disk DAV) return a 200 response code
		// with Content-Length: 0, which triggers a "no element found" error
		// in Firefox, so we override to text
		xmlhttp.overrideMimeType("text/plain");
		xmlhttp.onreadystatechange = function() {
			_stateChange(xmlhttp, callback);
		};
		xmlhttp.send(body);
		return xmlhttp;
	}
	
	
	/**
	 * Send a WebDAV PUT request via XMLHTTPRequest
	 *
	 * @param	{nsIURI}		url
	 * @param	{Function}	onDone
	 * @return	{XMLHTTPRequest}
	 */
	this.WebDAV.doDelete = function (uri, callback) {
		// Don't display password in console
		var disp = uri.clone();
		if (disp.password) {
			disp.password = "********";
		}
		
		Zotero.debug("WebDAV DELETE to " + disp.spec);
		
		if (Zotero.HTTP.browserIsOffline()) {
			return false;
		}
		
		var xmlhttp = Components.classes["@mozilla.org/xmlextras/xmlhttprequest;1"]
					.createInstance();
		// Prevent certificate/authentication dialogs from popping up
		xmlhttp.mozBackgroundRequest = true;
		xmlhttp.open("DELETE", uri.spec, true);
		// Firefox 3 throws a "no element found" error even with a
		// 204 ("No Content") response, so we override to text
		xmlhttp.overrideMimeType("text/plain");
		xmlhttp.onreadystatechange = function() {
			_stateChange(xmlhttp, callback);
		};
		xmlhttp.send(null);
		return xmlhttp;
	}
	
	
	/**
	 * Get the Authorization header used by a channel
	 *
	 * As of Firefox 3.0.1 subsequent requests to higher-level directories
	 * seem not to authenticate properly and just return 401s, so this
	 * can be used to manually include the Authorization header in a request
	 *
	 * It can also be used to check whether a request was forced to
	 * use authentication
	 *
	 * @param	{nsIChannel}		channel
	 * @return	{String|FALSE}				Authorization header, or FALSE if none
	 */
	this.getChannelAuthorization = function (channel) {
		try {
			channel.QueryInterface(Components.interfaces.nsIHttpChannel);
			var authHeader = channel.getRequestHeader("Authorization");
			return authHeader;
		}
		catch (e) {
			Zotero.debug(e);
			return false;
		}
	}
	
	
	/**
	 * Checks if the browser is currently in "Offline" mode
	 *
	 * @type Boolean
	 */
	this.browserIsOffline = function() { 
		return Components.classes["@mozilla.org/network/io-service;1"]
			.getService(Components.interfaces.nsIIOService).offline;
	}
	
	/**
	 * Load one or more documents in a hidden browser
	 *
	 * @param {String|String[]} urls URL(s) of documents to load
	 * @param {Function} processor Callback to be executed for each document loaded
	 * @param {Function} done Callback to be executed after all documents have been loaded
	 * @param {Function} exception Callback to be executed if an exception occurs
	 * @param {Boolean} dontDelete Don't delete the hidden browser upon completion; calling function
	 *                             must call deleteHiddenBrowser itself.
	 * @param {Zotero.CookieSandbox} [cookieSandbox] Cookie sandbox object
	 * @return {browser} Hidden browser used for loading
	 */
	this.processDocuments = function(urls, processor, done, exception, dontDelete, cookieSandbox) {
		/**
		 * Removes event listener for the load event and deletes the hidden browser
		 */
		var removeListeners = function() {
			hiddenBrowser.removeEventListener(loadEvent, onLoad, true);
			if(!dontDelete) Zotero.Browser.deleteHiddenBrowser(hiddenBrowser);
		}
		
		/**
		 * Loads the next page
		 * @inner
		 */
		var doLoad = function() {
			if(urls.length) {
				var url = urls.shift();
				try {
					Zotero.debug("loading "+url);
					hiddenBrowser.loadURI(url);
				} catch(e) {
					removeListeners();
					if(exception) {
						exception(e);
						return;
					} else {
						throw(e);
					}
				}
			} else {
				removeListeners();
				if(done) done();
			}
		};
		
		/**
		 * Callback to be executed when a page load completes
		 * @inner
		 */
		var onLoad = function() {
			if(hiddenBrowser.contentDocument.location.href == "about:blank") return;
			Zotero.debug(hiddenBrowser.contentDocument.location.href+" has been loaded");
			if(hiddenBrowser.contentDocument.location.href != prevUrl) {	// Just in case it fires too many times
				prevUrl = hiddenBrowser.contentDocument.location.href;
				try {
					processor(hiddenBrowser.contentDocument);
				} catch(e) {
					removeListeners();
					if(exception) {
						exception(e);
						return;
					} else {
						throw(e);
					}
				}
				doLoad();
			}
		};
		
		if(typeof(urls) == "string") urls = [urls];
		
		var prevUrl;
		var loadEvent = Zotero.isFx2 ? "load" : "pageshow";
		
		var hiddenBrowser = Zotero.Browser.createHiddenBrowser();
		hiddenBrowser.addEventListener(loadEvent, onLoad, true);
		if(cookieSandbox) cookieSandbox.attachToBrowser(hiddenBrowser);
		
		doLoad();
		
		return hiddenBrowser;
	}
	
	/**
	 * Handler for XMLHttpRequest state change
	 *
	 * @param {nsIXMLHttpRequest} XMLHttpRequest whose state just changed
	 * @param {Function} [onDone] Callback for request completion
	 * @param {String} [responseCharset] Character set to force on the response
	 * @private
	 */
	function _stateChange(xmlhttp, callback, responseCharset, data) {
		switch (xmlhttp.readyState){
			// Request not yet made
			case 1:
				break;
			
			case 2:
				break;
			
			// Called multiple times while downloading in progress
			case 3:
				break;
			
			// Download complete
			case 4:
				if (callback) {
					// Override the content charset
					if (responseCharset) {
						xmlhttp.channel.contentCharset = responseCharset;
					}
					callback(xmlhttp, data);
				}
			break;
		}
	}
}