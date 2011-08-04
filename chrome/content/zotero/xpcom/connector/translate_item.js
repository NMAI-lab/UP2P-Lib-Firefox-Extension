/*
    ***** BEGIN LICENSE BLOCK *****
    
    Copyright © 2009 Center for History and New Media
                     George Mason University, Fairfax, Virginia, USA
                     http://zotero.org
    
    This file is part of Zotero.
    
    Zotero is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.
    
    Zotero is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.
    
    You should have received a copy of the GNU Affero General Public License
    along with Zotero.  If not, see <http://www.gnu.org/licenses/>.
    
    ***** END LICENSE BLOCK *****
*/

Zotero.Translate.ItemSaver = function(libraryID, attachmentMode, forceTagType) {
	this.newItems = [];
	
	this._timeoutID = null;
}

Zotero.Translate.ItemSaver.ATTACHMENT_MODE_IGNORE = 0;
Zotero.Translate.ItemSaver.ATTACHMENT_MODE_DOWNLOAD = 1;
Zotero.Translate.ItemSaver.ATTACHMENT_MODE_FILE = 2;

Zotero.Translate.ItemSaver.prototype = {
	/**
	 * Saves items to Standalone or the server
	 */
	"saveItems":function(items, callback) {
		var me = this;
		// first try to save items via connector
		Zotero.Connector.callMethod("saveItems", {"items":items}, function(success, status) {
			if(success !== false) {
				Zotero.debug("Translate: Save via Standalone succeeded");
				callback(true, items);
			} else if(Zotero.isFx) {
				callback(false, new Error("Save via Standalone failed with "+status));
			} else {
				me._saveToServer(items, callback);
			}
		});
	},
	
	/**
	 * Saves items to server
	 */
	"_saveToServer":function(items, callback) {
		var newItems = [];
		for(var i in items) {
			newItems.push(Zotero.Utilities.itemToServerJSON(items[i]));
		}
		
		var url = 'users/%%USERID%%/items?key=%%APIKEY%%';
		var payload = JSON.stringify({"items":newItems}, null, "\t")
		
		Zotero.OAuth.doAuthenticatedPost(url, payload, function(status, message) {
			if(!status) {
				Zotero.debug("Translate: Save to server failed with message "+message+"; payload:\n\n"+payload);
				callback(false, new Error("Save to server failed with "+message));
			} else {
				Zotero.debug("Translate: Save to server complete");
				callback(true, newItems);
			}
		}, true);
	}
};