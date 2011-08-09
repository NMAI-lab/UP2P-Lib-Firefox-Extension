{
	"translatorID":"1e5e0840-c1e7-11e0-8294-0002a5d5c51b",
	"translatorType":4,
	"label":"U-P2P BibTeXML (Web Scraper)",
	"creator":"Alexander Craig",
	"target":"view.jsp\\?.*(up2p:resource=.{32}|up2p:community=.{32})",
	"minVersion":"3.0",
	"maxVersion":"",
	"priority":100,
	"inRepository":false,
	"lastUpdated":"2011-07-04 14:40:00"
}

var inputFieldMap = {
	title:"title",
	volume:"volume",
	place:"address",
	url:"howpublished",
	type:"type",
	series:"series",
	chapter:"chapter",
	edition:"edition"
};

var bibtex2zoteroTypeMap = {
	"book":"book", // or booklet, proceedings
	"inbook":"bookSection",
	"incollection":"bookSection",
	"article":"journalArticle", // or magazineArticle or newspaperArticle
	"phdthesis":"thesis",
	"unpublished":"manuscript",
	"inproceedings":"conferencePaper", // check for conference also
	"conference":"conferencePaper",
	"techreport":"report",
	"booklet":"book",
	"manual":"book",
	"mastersthesis":"thesis",
	"misc":"book",
	"proceedings":"book"
};

// -------------------------------------------------------------------
// ---------------- Web Scraper Implementation -----------------------
// -------------------------------------------------------------------
function detectWeb(doc, url) {
	// Check to see if the active community is UP2P-Lib
	var communityXml = doc.getElementById("zotero-comm-id");
	if(communityXml == null) {
		return false;
	}
	
	// First check for multiple selections (community view)
	var rawData = doc.getElementById("zotero-raw-multi-xml");
	if(rawData != null) {
		// Fetch the titles and resource ID's of each publication
		return "multiple";
	}
	
	// URL matches U-P2P single resourceformat, now get the item type by reading the XML
	rawData = doc.getElementById("zotero-raw-single-xml");
	if(rawData != null) {
		var xmlDoc = new XML(rawData.innerHTML);
		var childList = xmlDoc.*;
		for each (var child in childList) {
			if(child.name() == "file") {
				// File attachment field, ignore it
			} else {
				return child.name();
			}
		}
	}
	
	return false;
}

/**
 * Replaces any XML escape sequences in the passed string with their
 * respective characters, and returns the result.
 */
function xmlDecode(text) {
	var newText = text.replace(/\&quot;/g, '"');
	newText = newText.replace(/\&apos;/g, "'");
	newText = newText.replace(/\&lt;/g, "<");
	newText = newText.replace(/&gt;/g, ">");
	newText = newText.replace(/\&amp;/g, "&");
	return newText;
}

/**
 * Converts a BibTeXML creator string into a creator object for use with a Zotero item.
 */
function buildCreatorObj(creatorString, creatorType) {
	var creator = {};
	
	// BibTeXML doesn't store first and last name of authors separately...
	// For now, assume that the first comma in the name is the separator
	var firstComma = creatorString.indexOf(",");
	if(firstComma == -1) {
		// No first/last name separator detected, use the whole string as the last name
		creator.firstName = "";
		creator.lastName = creatorString;
	} else {
		creator.firstName = creatorString.substring(firstComma + 1);
		creator.lastName = creatorString.substring(0, firstComma);
	}
	
	creator.creatorType = creatorType;
	return creator;
}

function doWeb(doc, url) {
	var communityId = doc.getElementById("zotero-comm-id").innerHTML;
	
	if(detectWeb(doc, url) == "multiple") {
		// Multiple publication viewing page import
		var rawData = doc.getElementById("zotero-raw-multi-xml");
		
		var items = new Object();
		var xmlList = new Object();
		
		var xmlDoc = new XML(rawData.innerHTML);
		var childList = xmlDoc.*;
		for each (var child in childList) {
			var childTitle = child.@title.toString();
			if(child..file.length() > 0) {
				childTitle = "[PDF] " + childTitle;
			}
			items[child.@id.toString()] = childTitle;
			xmlList[child.@id.toString()] = child.*;
		}
		
		Zotero.selectItems(items, function(items) {
			if(!items) return true;
			for (var i in items) {
				importXMLNode(xmlList[i], communityId,
					i, url);
			}
		});
	} else {
		// Single publication viewing page import
		var entryRoot = new XML(doc.getElementById("zotero-raw-single-xml").innerHTML);
		importXMLNode(entryRoot, communityId,
				url.substr(url.indexOf("up2p:resource=") + 14, 32),
				url);
	}
}

function importXMLNode(entryRoot, communityId, resourceId, url) {
	var newItem = new Zotero.Item();
	
	// Get the item type of the item
	var bibtexmlItemType;
	for each(var entryType in entryRoot.*) {
		if(entryType.name() == "file") {
			// Attachment field for the entry, try to download the attachment
			var idString = "community/" + communityId
					+ "/" + resourceId + "/";
			var pdfTitle = "";

			if(entryType.text().indexOf("file:") == 0) {
				pdfTitle = entryType.toString().substr(5);
			} else {
				pdfTitle = entryType.toString().substr(idString.length);
			}
			
			var pdfUrl = url.substring(0, url.indexOf("view.jsp")) + idString
					+ pdfTitle;
			
			newItem.attachments.push({
				title: pdfTitle,
				mimeType:"application/pdf",
				url:pdfUrl});
		} else {
			bibtexmlItemType = entryType.name();
			newItem.itemType = bibtex2zoteroTypeMap[bibtexmlItemType];
			isValid = true;
		}
	}
	
	// Get all the fields specified in the inputFieldMap (values for these fields require no
	// special processing, and can just be copied unmodified to the Zotero item)
	for each(var xmlTag in entryRoot.*.*) {
		for(var field in inputFieldMap) {
			if(xmlTag.name() == inputFieldMap[field]) {
				newItem[field] = xmlDecode(xmlTag);
				break; // Each XML tag should only correspond to 1 field
			}
		}
	}
	
	// Get the author / editors of the piece (requires special processing to generate
	// creator objects)
	for each(var author in entryRoot.*.author) {
		var creator = buildCreatorObj(xmlDecode(author), "author");
		newItem.creators.push(creator);
	}
	for each(var editor in entryRoot.*.editor) {
		var creator = buildCreatorObj(xmlDecode(editor), "editor");
		newItem.creators.push(creator);
	}
	
	// If a journal or booktitle is specified, store it as the publicationTitle
	// (Multiple fields in BibTeXML map to publicationTitle in Zotero)
	for each(var pubTitle in entryRoot.*.booktitle) {
		newItem.publicationTitle = xmlDecode(pubTitle);
	}
	for each(var pubTitle in entryRoot.*.journal) {
		newItem.publicationTitle = xmlDecode(pubTitle);
	}
	
	// Get the publisher (multiple fields in BibTeXML map to publisher in Zotero)
	for each(var publisher in entryRoot.*.publisher) {
		newItem.publisher = xmlDecode(publisher);
	}
	for each(var publisher in entryRoot.*.institution) {
		newItem.publisher = xmlDecode(publisher);
	}
	for each(var publisher in entryRoot.*.school) {
		newItem.publisher = xmlDecode(publisher);
	}
	
	// Get the publication date (date requires month / year processing)
	var dateString = "";
	for each(var month in entryRoot.*.month) {
		dateString += month + " ";
	}
	for each(var year in entryRoot.*.year) {
		dateString += year;
	}
	if(dateString != "") {
		newItem.date = xmlDecode(dateString);
	}
	
	// Read the "number" field based on the type of element
	for each(var number in entryRoot.*.number) {
		if(bibtexmlItemType == "techreport") {
			newItem.reportNumber = xmlDecode(number);
		} else if (bibtexmlItemType == "article") {
			newItem.issue = xmlDecode(number);
		} else {
			newItem.seriesNumber = xmlDecode(number);
		}
	}
	
	// Read the "pages" field, converting TeX style double dashes back to a single dash
	for each(var pages in entryRoot.*.pages) {
		newItem.pages = xmlDecode(pages.replace("--", "–"));	// Doesn't seem to actually be working
	}
	
	if(isValid) {
		newItem.complete();
	} else {
		Zotero.debug("Invalid item found in BibTeXML import.");
	}
}