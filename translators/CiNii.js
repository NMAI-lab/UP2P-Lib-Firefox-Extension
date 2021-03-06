{
	"translatorID":"46291dc3-5cbd-47b7-8af4-d009078186f6",
	"translatorType":4,
	"label":"CiNii",
	"creator":"Michael Berkowitz and Mitsuo Yoshida",
	"target":"http://ci.nii.ac.jp/",
	"minVersion":"1.0.0b4.r5",
	"maxVersion":"",
	"priority":100,
	"inRepository":true,
	"lastUpdated":"2010-05-20 04:00:00"
}

function detectWeb(doc, url) {
	if (url.match(/naid/)) {
		return "journalArticle";
	} else if (doc.evaluate('//a[contains(@href, "/naid/")]', doc, null, XPathResult.ANY_TYPE, null).iterateNext()) {
		return "multiple";
	}
}

function doWeb(doc, url) {
	var n = doc.documentElement.namespaceURI;
	var ns = n ? function(prefix) {
		if (prefix == 'x') return n; else return null;
	} : null;
	var arts = new Array();
	if (detectWeb(doc, url) == "multiple") {
		var items = new Object();
		var links = doc.evaluate('//a[contains(@href, "/naid/")]', doc, ns, XPathResult.ANY_TYPE, null);
		var link;
		while (link = links.iterateNext()) {
			items[link.href] = Zotero.Utilities.trimInternal(link.textContent);
		}
		items = Zotero.selectItems(items);
		for (var i in items) {
			arts.push(i);
		}
	} else {
		arts = [url];
	}
	Zotero.Utilities.processDocuments(arts, function(doc) {
		var biblink = 'http://ci.nii.ac.jp/export?fileType=2&docSelect=' + doc.evaluate('//input[@name="docSelect"]', doc, ns, XPathResult.ANY_TYPE, null).iterateNext().value;
		var newurl = doc.location.href;
		var tags = new Array();
		if (doc.evaluate('//a[@rel="tag"]', doc, ns, XPathResult.ANY_TYPE, null).iterateNext()) {
			var kws = doc.evaluate('//a[@rel="tag"]', doc, ns, XPathResult.ANY_TYPE, null);
			var kw;
			while (kw = kws.iterateNext()) {
				tags.push(Zotero.Utilities.trimInternal(kw.textContent));
			}
		}
		var abstractNote;
		if (doc.evaluate('//div[@class="abstract"]', doc, ns, XPathResult.ANY_TYPE, null).iterateNext()) {
			abstractNote = doc.evaluate('//div[@class="abstract"]', doc, ns, XPathResult.ANY_TYPE, null).iterateNext().textContent;
		}
		Zotero.Utilities.HTTP.doGet(biblink, function(text) {
			var trans = Zotero.loadTranslator("import");
			trans.setTranslator("9cb70025-a888-4a29-a210-93ec52da40d4");
			trans.setString(text);
			trans.setHandler("itemDone", function(obj, item) {
				item.url = newurl;
				item.attachments = [{url:item.url, title:item.title + " Snapshot", mimeType:"text/html"}];
				item.tags = tags;
				item.abstractNote = abstractNote;
				item.complete();
			});
			trans.translate();
		});
	}, function() {Zotero.done();});
	Zotero.wait();
}