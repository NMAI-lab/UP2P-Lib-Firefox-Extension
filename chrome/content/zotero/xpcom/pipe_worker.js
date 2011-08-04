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

onmessage = function(event) {
	var path = event.data.path;
	
	// ctypes declarations follow
	var lib = ctypes.open(event.data.libc);
	
	// int open(const char *path, int oflag, ...);
	var open = lib.declare("open", ctypes.default_abi, ctypes.int, ctypes.char.ptr, ctypes.int); 
	
	// ssize_t read(int fildes, void *buf, size_t nbyte);
	var read = lib.declare("read", ctypes.default_abi, ctypes.ssize_t, ctypes.int,
		ctypes.char.ptr, ctypes.size_t); 
	
	// int close(int fildes);
	var close = lib.declare("close", ctypes.default_abi, ctypes.int, ctypes.int); 
	
	// define buffer for reading from fifo
	const BUFFER_SIZE = 4096;
	
	postMessage(["Open", null]);
	while(true) {
		var buf = ctypes.char.array(BUFFER_SIZE)("");
		
		// open fifo (this will block until something writes to it)
		var fd = open(path, 0);
		
		// read from fifo and close it
		read(fd, buf, BUFFER_SIZE-1);
		close(fd);
		
		// extract message
		var string = buf.readString();
		if(string === "Zotero shutdown\n") {
			postMessage(["Debug", "IPC: Worker closing "+event.data.path]);
			lib.close();
			return;
		}
		
		postMessage(["Read", string]);
	}
};