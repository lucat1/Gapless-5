//////////////
//
// Gapless 5: Gapless JavaScript/CSS audio player for HTML5
// (requires jQuery 1.x or greater)
//
// Version 0.5
// Copyright 2014 Rego Sen
//
//////////////

// PROBLEM: We have 2 API's for playing audio through the web, and both of them have problems:
//          - HTML5 Audio: the last chunk of audio gets cut off, making gapless transitions impossible
//          - WebAudio: can't play a file until it's fully loaded
// SOLUTION: Use both!
// If WebAudio hasn't loaded yet, start playback with HTML5 Audio.  Then seamlessly switch to WebAudio once it's loaded.

// NOTE: Mobile browsers don't fully support Audio objects in js, so we're stuck with only WebAudio in that case.
window.mobilecheck = function() {
	// taken from http://detectmobilebrowsers.com
	var check = false;
	(function(a){if(/(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od|ad)|iris|kindle|lge |maemo|midp|mmp|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows (ce|phone)|xda|xiino/i.test(a)||/1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(a.substr(0,4)))check = true})(navigator.userAgent||navigator.vendor||window.opera);
	return check; }
window.hasWebKit = ('webkitAudioContext' in window) && !('chrome' in window);

// There can be only one AudioContext per window, so to have multiple players we must define this outside the player scope
var gapless5AudioContext = (window.hasWebKit) ? new webkitAudioContext() : (typeof AudioContext != "undefined") ? new AudioContext() : null;


var GAPLESS5_PLAYERS = {};
var Gapless5State = {
	"None"    : 0,
	"Loading" : 1,
	"Play"    : 2,
	"Stop"    : 3,
	"Error"   : 4
	};


// A Gapless5Source "class" handles track-specific audio requests
function Gapless5Source(parentPlayer, inContext, inOutputNode) {

	// WebAudio API
	var context = inContext;
	var outputNode = inOutputNode;
	var audioPath = "";

	// Audio object version
	var audio = null;

	// Buffer source version
	var source = null;
	var buffer = null;
	var request = null;

	// states
	var startTime = 0;
	var position = 0;
	var endpos = 0;
	var queuedState = Gapless5State.None;
	var state = Gapless5State.None;
	var loadedPercent = 0;
	var audioFinished = false;
	var endedCallback = null;

	this.uiDirty = false;
	var that = this;
	var parent = parentPlayer;

	this.setGain = function (val) {
		if (audio != null)
		{
			audio.volume = val;
		}
	}

	this.getState = function () { return state; }

	var setState = function (newState) {
		state = newState;
		queuedState = Gapless5State.None;
	};

	this.cancelRequest = function (isError) {
		setState((isError == true) ? Gapless5State.Error : Gapless5State.None);
		if (request)
		{
			request.abort();
		}
		audio = null;
		source = null;
		buffer = null;
		position = 0;
		endpos = 0;
		that.uiDirty = true;
	}

	var onEnded = function (endEvent) {
		if (state != Gapless5State.Play) return;
		audioFinished = true;
		parent.onEndedCallback();
	}

	var onPlayEvent = function (playEvent) {
		startTime = (new Date().getTime()) - position;
	}

	var onLoadedWebAudio = function (inBuffer) {
		if (!request) return;
		request = null;
		buffer = inBuffer;
		endpos = inBuffer.duration * 1000;
		if (audio != null || !parent.useHTML5Audio)
		{
			parent.dequeueNextLoad();
		}

		if (queuedState == Gapless5State.Play && state == Gapless5State.Loading)
		{
			playAudioFile(true);
		}
		else if ((audio != null) && (queuedState == Gapless5State.None) && (state == Gapless5State.Play))
		{
			//console.log("switching from HTML5 to WebAudio");
			position = (new Date().getTime()) - startTime;
			if (!window.hasWebKit) position -= parent.tickMS;
			that.setPosition(position, true);
		}
		if (state == Gapless5State.Loading)
		{
			state = Gapless5State.Stop;
		}
		// once we have WebAudio data loaded, we don't need the HTML5 audio stream anymore
		audio = null;
		that.uiDirty = true;
	}

	var onLoadedHTML5Audio = function (inBuffer) {
		if (state != Gapless5State.Loading) return;
		if (buffer != null || !parent.useWebAudio)
		{
			parent.dequeueNextLoad();
		}

		state = Gapless5State.Stop;
		endpos = audio.duration * 1000;

		if (queuedState == Gapless5State.Play)
		{
			playAudioFile(true);
		}
		that.uiDirty = true;
	}

	this.stop = function () {
		if (state == Gapless5State.Stop) return;
		
		if (parent.useWebAudio)
		{
			if (source)
			{
				if (endedCallback)
				{
					window.clearTimeout(endedCallback);
					endedCallback = null;
				}
				if (window.hasWebKit) 
					source.noteOff(0);
				else 
					source.stop(0);
			}
		}
		if (audio)
		{
			audio.pause();
		}

		setState(Gapless5State.Stop);
		that.uiDirty = true;
	};

	var playAudioFile = function (force) {
		if (state == Gapless5State.Play) return;
		position = Math.max(position, 0);
		if (position >= endpos) position = 0;

		var offsetSec = position / 1000;
		startTime = (new Date().getTime()) - position;

		if (buffer != null)
		{
			//console.log("playing WebAudio");
			source = context.createBufferSource();
			source.connect(outputNode);
			source.buffer = buffer;

			var restSec = source.buffer.duration-offsetSec;
			if (endedCallback)
			{
				window.clearTimeout(endedCallback);
			}
			endedCallback = window.setTimeout(onEnded, restSec*1000);
			if (window.hasWebKit)
				source.noteGrainOn(0, offsetSec, restSec);
			else
				source.start(0, offsetSec);
			setState(Gapless5State.Play);
		}
		else if (audio != null)
		{
			//console.log("playing HTML5 Audio");
			audio.currentTime = offsetSec;
			audio.volume = outputNode.gain.value;
			audio.play();
			setState(Gapless5State.Play);
		}
		that.uiDirty = true;
	};

	// PUBLIC FUNCTIONS

	this.inPlayState = function() {
		return (state == Gapless5State.Play); 
	}

	this.isPlayActive = function() {
		return (that.inPlayState() || queuedState == Gapless5State.Play) && !that.audioFinished; 
	}

	this.getPosition = function() { return position; }

	this.getLength = function() { return endpos; }

	this.play = function() {
		if (state == Gapless5State.Loading)
		{
			queuedState = Gapless5State.Play;
		}
		else
		{
			playAudioFile(); // play immediately
		}
	}

	this.tick = function() {
		if (state == Gapless5State.Play)
		{
			position = (new Date().getTime()) - startTime;
		}

		if (loadedPercent < 1)
		{
			var newPercent = (state == Gapless5State.Loading) ? 0 : (audio && audio.seekable.length > 0) ? (audio.seekable.end(0) / audio.duration) : 1;
			if (loadedPercent != newPercent)
			{
				loadedPercent = newPercent;
				parent.setLoadedSpan(loadedPercent)
			}
		}
	}

	this.setPosition = function(newPosition, bResetPlay) {
		position = newPosition;
		if (bResetPlay == true && that.inPlayState())
		{
			that.stop();
			that.play();
		}
	};

	this.load = function(inAudioPath) {
		audioPath = inAudioPath;
		if (source || audio)
		{
			parent.dequeueNextLoad();
			return;
		}
		if (state == Gapless5State.Loading)
		{
			return;
		}
		state = Gapless5State.Loading;
		if (parent.useWebAudio)
		{
			request = new XMLHttpRequest();
			request.open('get', inAudioPath, true);
			request.responseType = 'arraybuffer';

			request.onload = function () {
				context.decodeAudioData(request.response,
					 function(incomingBuffer) {
						 onLoadedWebAudio(incomingBuffer);
					 }
				 );
			};
			request.send();
		}
		if (parent.useHTML5Audio)
		{
			audio = new Audio();
			audio.controls = false;
			audio.src = inAudioPath;
	 		audio.addEventListener('canplaythrough', onLoadedHTML5Audio, false);
	 		audio.addEventListener('ended', onEnded, false);
	 		audio.addEventListener('play', onPlayEvent, false);
 			// not using audio.networkState because it's not dependable on all browsers
		}
		// cancel if url doesn't exist, but don't download again
		$.ajax({
			url: inAudioPath,
			type: "HEAD",
		}).fail(function() { 
			that.cancelRequest(true);
		});
	}
}


// A Gapless5FileList "class". Processes an array of JSON song objects, taking 
// the "file" members out to constitute the sources[] in the Gapless5 player
var Gapless5FileList = function(inPlayList, inStartingTrack) {

	// OBJECT STATE
	// Playlist and Track Items
	this.original = inPlayList;	// Starting JSON input
	this.previous = {};		// Support double-toggle undo
	this.current = {};		// Working playlist
	this.previousItem = 0;		// to last list and last index

	this.startingTrack = inStartingTrack;
	if ( inStartingTrack == null )
	{
		this.startingTrack = 0;
	}	
	this.currentItem = inStartingTrack;
	this.displayIndex = inStartingTrack;	// Displayed track index in GUI

	var that = this;

	// If the tracklist ordering changes, after a pre/next song,
	// the playlist needs to be regenerated
	var shuffleMode = false;	// Ordered or Shuffle
	var remakeList = false;		// Will need to re-order list
					// upon track changing

	// PRIVATE METHODS
	// Swap two elements in an array
	var swapElements = function(someList, sourceIndex, destIndex) { 
		var temp = someList[sourceIndex];
		someList[sourceIndex] = someList[destIndex];
		someList[destIndex] = temp;
	}

	// Add _index values to each member of the array, so we know what the
	// original track was.
	var addIndices = function(inputList) {
		var temp = inputList.slice();
		for ( var n = 0; n < temp.length ; n++)
			temp[n]._index = n + 1;
		return temp;
	}

	// Reorder an array so that the outputList starts at the desiredIndex
	// of the inputList.
	var reorder = function(inputList, desiredIndex) {
		var tempList = inputList.slice();
		var outputList = tempList.concat(tempList.splice(0, desiredIndex));
		return outputList;
	}

	// Shuffle a playlist, making sure that the next track in the list
	// won't be the same as the current track being played.
	var shuffle = function(inputList, index) {
		var startList = inputList.slice();
		var outputList = inputList.slice();

		// Shuffle the input list
		for ( var n = 0; n < startList.length - 1; n++ ) 
		{
			var k = n + Math.floor(Math.random() * (startList.length - n ));
			var temp = startList[k];
			startList[k] = startList[n];
			startList[n] = temp;
		}

		// Reorder playlist array so that the chosen index comes first, 
		// and gotoTrack isn't needed after Player object is remade.
		outputList = reorder(startList, index);

		// In a Gapless playback-ordered list, after moving to an ordered list,
		// current is always 0, next is always 1, and last is always "-1".
		var nextIndex = 1;
		var prevIndex = outputList.length - 1;     

		// After shuffling, if the next/previous track is the same as
		// the current track in the unshuffled, swap the current index.
		if ( startList[index].file == outputList[prevIndex].file ) 
			swapElements(outputList, 0, prevIndex);

		if ( startList[index].file == outputList[nextIndex].file ) 
			swapElements(outputList, 0, nextIndex);

		return outputList;
        }

	// Already pressed the shuffle button once from normal mode.
	// Revert to previous list / item, and terminate. TODO: TEST
	var revertShuffle = function() {
		that.current = that.previous;
		that.currentItem = that.previousItem;

		shuffleMode = !(shuffleMode);
		remakeList = false;
	}

	// Going into shuffle mode. Tell the Player to remake the list
	// as soon as a new track is reached or chosen. 
	var enableShuffle = function() {
		// Save old state in case we need to revert
		that.previous = that.current.slice();
		that.previousItem = that.currentItem;

		that.current = shuffle(that.original, that.currentItem);
		that.currentItem = 0;
	
		shuffleMode = true;
		remakeList = true;
	}

	// Leaving shuffle mode. Tell the Player to remake the list
	// as soon as a new track is reached or chosen. TODO: TEST
	var disableShuffle = function() {
		// Save old state in case we need to revert
		that.previous = that.current.slice();
		that.previousItem = that.currentItem;

		// Find where current song is in original playlist, and make that
		// the head of the new unshuffled playlist
		var track = that.current[that.currentItem];
		var point = 0;
		for (var i = 0; i < that.original.length ; i++ )
			if (track == that.original[i] )
                		point = i;
        	
		that.current = reorder(that.original, point);

		that.currentItem = 0;	// Position to head of list
		shuffleMode = false;
		remakeList = true;
	}

	// PUBLIC METHODS
	// After a shuffle or unshuffle, the array has changed. Get the index
	// for the current-displayed song in the previous array.
	this.lastIndex = function(index, oldList) {
		compare = that.current[index];
		for (var n = 0; n < oldList.length ; n++ )
			if ( oldList[n] == compare )
				return n;

	// Toggle shuffle mode or not, and prepare for rebasing the playlist
	// upon changing to the next available song. NOTE that each function here
	// changes flags, so the logic must exclude any logic if a revert occurs.
	this.shuffleToggle = function() {
		if ( remakeList == true ) 
			return revertShuffle();	

		if ( shuffleMode == false )
			return enableShuffle();

		if ( shuffleMode == true )
			return disableShuffle();
	}

	// After toggling the list, the next/prev track action must trigger
	// the list getting remade, with the next desired track as the head.
	// This function will remake the list as needed.
	this.rebasePlayList = function(index) {
		if ( shuffleMode == true )
			that.current = reorder(that.current, index);

		that.currentItem = 0;		// Position to head of the list
		remakeList = false;		// Rebasing is finished.
	}

	// Signify to this object that at the next track change, it will be OK 
	// to reorder the current playlist starting at the next desired track.
	this.readyToRemake = function() {
		return remakeList;
	}

	// Are we in shuffle mode or not? If we just came out of shuffle mode,
	// the player object will want to know.
	this.justShuffled = function() {
		return shuffleMode;
	}

	// PlayList manipulation requires us to keep state on which track is 		
	// playing. Player object state changes may need to update the current		
	// index in the FileList object as well.		
	this.set = function(index) {		
		that.currentItem = index;
		that.displayIndex = this.current[index]._index;		
	}
	
	this.get = function(index) {
		return that.currentItem;
	}

	// Get an array of songfile paths from this object, appropriate for 
	// including in a Player object.
	this.files = function() {
		return that.current.map(function (song) { return song.file });
	}

	// Add _index parameter to the JSON array of tracks
	this.original = addIndices(this.original);

	// On object creation, make current list use startingTrack as head of list
	this.current = reorder(this.original, this.startingTrack);

}



// parameters are optional.  options:
//   tracks: path of file (or array of music file paths)
//   playOnLoad (default = false): play immediately
//   useWebAudio (default = true)
//   useHTML5Audio (default = false on mobile browsers, true otherwise)
var Gapless5 = function(elem_id, options) {

// MEMBERS AND CONSTANTS

// PUBLIC
this.tickMS = 27; // fast enough for numbers to look real-time

// PRIVATE

// UI
var SCRUB_RESOLUTION = 65535;
var SCRUB_WIDTH = 0;
var scrubPosition = 0;
var isScrubbing = false;
var LOAD_TEXT = "loading..."
var ERROR_TEXT = "error!"

// System
var initialized = false;
var isMobileBrowser = window.mobilecheck();
this.loop = (options != null) && (options.loop == true);
this.useWebAudio = ((options != null) && ('useWebAudio' in options)) ? options.useWebAudio : true;
this.useHTML5Audio = ((options != null) && ('useHTML5Audio' in options)) ? options.useHTML5Audio : !isMobileBrowser;
this.id = Math.floor((1 + Math.random()) * 0x10000);

// WebAudio API
var context = gapless5AudioContext;
var gainNode = (window.hasWebKit) ? context.createGainNode() : (typeof AudioContext != "undefined") ? context.createGain() : null;
if (context && gainNode)
{
	gainNode.connect(context.destination);
}

// Playlist
var loadingTrack = -1;
var sources = [];	// Loaded as audio files
this.tracks = null;	// Playlist manager object


// Callback and Execution logic
var inCallback = false;
var firstUICallback = true;
var that = this;
var isPlayButton = true;
var isShuffleButton = true;
var keyMappings = {};

// Callbacks
this.onprev = null;
this.onplay = null;
this.onpause = null;
this.onstop = null;
this.onnext = null;
this.onshuffle = null;

this.onerror = null;
this.onfinishedtrack = null;
this.onfinishedall = null;


// INTERNAL HELPERS
var getUIPos = function () {
	var position = isScrubbing ? scrubPosition : sources[index()].getPosition();
	return (position / sources[index()].getLength()) * SCRUB_RESOLUTION;
};

var getSoundPos = function (uiPosition) {
	return ((uiPosition / SCRUB_RESOLUTION) * sources[index()].getLength());
};

var numTracks = function () {
	// FileList object must be initiated
	if ( that.tracks != null )
		return that.tracks.current.length;
	else
		return 0;
};

var index = function () {
	// FileList object must be initiated
	if ( that.tracks != null )
		return that.tracks.get();
	else
		return -1;
}

var readyToRemake = function () {
	// FileList object must be initiated
	if ( that.tracks.readyToRemake() != null )
		return that.tracks.readyToRemake();
	else
		return false;
}

var getFormattedTime = function (inMS) {
    var minutes = Math.floor(inMS / 60000);
    var seconds_full = (inMS - (minutes * 60000)) / 1000;
    var seconds = Math.floor(seconds_full);
    var csec = Math.floor((seconds_full - seconds) * 100);
    
    if (minutes < 10) { minutes = "0" + minutes; }
    if (seconds < 10) { seconds = "0" + seconds; }
    if (csec < 10) { csec = "0" + csec; }
    
    return minutes + ':' + seconds + '.' + csec;
};

var getTotalPositionText = function () {
	var text = LOAD_TEXT;
	var srcLength = sources[index()].getLength();
	if (numTracks() == 0)
	{
		text = getFormattedTime(0);
	}
	else if (readyToRemake()) 
	{ 
		text = getFormattedTime(sources[lastIndex()].getLength();	
	}
	else if (sources[index()].getState() == Gapless5State.Error)
	{
		text = ERROR_TEXT;
	}
	else if (srcLength > 0)
	{
		text = getFormattedTime(srcLength);
	}
	return text;
};

var runCallback = function (cb) {
	if (cb)
	{
		inCallback = true;
		cb();
		inCallback = false;
	}
};

// after shuffle mode toggle and track change, re-grab the tracklist
var refreshTracks = function(newIndex) {
	// prevent updates while tracks are coming in
	initialized = false;

	that.removeAllTracks();
	that.tracks.rebasePlayList(newIndex);

	for (var i = 0; i < numTracks() ; i++ )
	{
		that.addTrack(that.tracks.files()[i]);
	}

	// re-enable GUI updates
	initialized = true;
};


// (PUBLIC) ACTIONS
this.totalTracks = function() {
	return numTracks();
}


this.mapKeys = function (options) {
	for (var key in options)
	{
		var uppercode = options[key].toUpperCase().charCodeAt(0);
		var lowercode = options[key].toLowerCase().charCodeAt(0);
		var linkedfunc = null;
		var player = GAPLESS5_PLAYERS[that.id];
		switch (key)
		{
			case "cue":
				linkedfunc = player.cue;
				break;
			case "play":
				linkedfunc = player.play;
				break;
			case "pause":
				linkedfunc = player.pause;
				break;
			case "playpause":
				linkedfunc = player.playpause;
				break;
			case "stop":
				linkedfunc = player.stop;
				break;
			case "prevtrack":
				linkedfunc = player.prevtrack;
				break;
			case "prev":
				linkedfunc = player.prev;
				break;
			case "next":
				linkedfunc = player.next;
				break;
		}
		if (linkedfunc != null)
		{
			keyMappings[uppercode] = linkedfunc;
			keyMappings[lowercode] = linkedfunc;
		}
	}
};

this.setGain = function (uiPos) {
	var normalized = uiPos / SCRUB_RESOLUTION;
	//var power_range = Math.sin(normalized * 0.5*Math.PI);
	gainNode.gain.value = normalized; //power_range;
	sources[index()].setGain(normalized);
};

this.scrub = function (uiPos) {
	scrubPosition = getSoundPos(uiPos);
	$("#currentPosition" + that.id).html(getFormattedTime(scrubPosition));
	enableButton('prev', that.loop || (index() != 0 || scrubPosition != 0));
	if (!isScrubbing)
	{
		sources[index()].setPosition(scrubPosition, true);
	}
};

this.setLoadedSpan = function(percent)
{
	$("#loaded-span" + that.id).width(percent * SCRUB_WIDTH);
	if (percent == 1)
	{
		$("#totalPosition" + that.id).html(getTotalPositionText());
	}
};

this.onEndedCallback = function() {
	// we've finished playing the track
	resetPosition();
	sources[index()].stop(true);
	if (that.loop || index() < numTracks() - 1)
	{
		that.next(true);
		runCallback(that.onfinishedtrack);
	}
	else
	{
		runCallback(that.onfinishedtrack);
		runCallback(that.onfinishedall);
	}
};

this.dequeueNextLoad = function() { 
	if (that.loadQueue.length > 0)
	{
		var entry = that.loadQueue.shift();
		loadingTrack = entry[0];
		if (loadingTrack < sources.length)
		{
			//console.log("loading track " + loadingTrack + ": " + entry[1]);
			sources[loadingTrack].load(entry[1]);
		}
	}
	else
	{
		loadingTrack = -1;
	}
}

this.onStartedScrubbing = function () {
	isScrubbing = true;
};

this.onFinishedScrubbing = function () {
	isScrubbing = false;
	var newPosition = scrubPosition;
	if (sources[index()].inPlayState() && newPosition >= sources[index()].getLength())
	{
		that.next(true);
	}
	else
	{
		sources[index()].setPosition(newPosition, true);
	}
};

this.loadQueue = [];

this.addTrack = function (audioPath) {
	var next = sources.length;
	sources[next] = new Gapless5Source(this, context, gainNode);
	that.loadQueue.push([next, audioPath]);
	if (loadingTrack == -1)
	{
		that.dequeueNextLoad();
	}
	if (initialized)
	{
		updateDisplay();
	}
};

this.insertTrack = function (point, audioPath) {
	var trackCount = numTracks();
	point = Math.min(Math.max(point, 0), trackCount);
	if (point == trackCount)
	{
		that.addTrack(audioPath);
	}
	else
	{
		var oldPoint = point+1;
		sources.splice(point, 0, new Gapless5Source(this, context, gainNode));

		//re-enumerate queue
		for (var i in that.loadQueue)
		{
			var entry = that.loadQueue[i];
			if (entry[0] >= point)
			{
				entry[0] += 1;
			}
		}
		that.loadQueue.splice(0,0,[point,audioPath]);
		updateDisplay();
	}
};

this.removeTrack = function (point) {
	if (point < 0 || point >= sources.length) return;

	var curSource = sources[point];
	if (curSource.getState() == Gapless5State.Loading)
	{
		curSource.cancelRequest();
	}
	else if (curSource.getState() == Gapless5State.Play)
	{
		curSource.stop();
	}
	
	var removeIndex = -1;
	for (var i in that.loadQueue)
	{
		var entry = that.loadQueue[i];
		if (entry[0] == point)
		{
			removeIndex = i;
		}
		else if (entry[0] > point)
		{
			entry[0] -= 1;
		}
	}
	if (removeIndex >= 0)
	{
		that.loadQueue.splice(removeIndex,1);
	}
	// TODO: FileList needs add/remove playlist items
	// that.tracks.splice(index,1);
	sources.splice(point,1);
	if (loadingTrack == point)
	{
		that.dequeueNextLoad();
	}
	if (initialized)
	{
		updateDisplay();
	}
};

this.replaceTrack = function (point, audioPath) {
	that.removeTrack(point);
	that.insertTrack(point, audioPath);
}

this.removeAllTracks = function () {
	for (var i in sources)
	{
		if (sources[i].getState() == Gapless5State.Loading)
		{
			sources[i].cancelRequest();
		}
	}
	loadingTrack = -1;
	sources = [];
	that.loadQueue = [];
	if (initialized)
	{
		updateDisplay();
	}
};

this.shuffleToggle = function() {
	that.tracks.shuffleToggle();
	if (isShuffleButton)
		enableButton('shuffle', false);
	else
		enableButton('shuffle', true);
};

this.gotoTrack = function (newIndex, bForcePlay) {
	if (inCallback) return;

	var justRemade = false;

	// If the list is flagged for remaking on the change of shuffle mode, 
	// remake the list in shuffled order
	if ( readyToRemake() == true ) {
		// just changed our shuffle mode. remake the list
		sources[that.tracks.previousItem].stop();
		refreshTracks(newIndex);
		justRemade = true;
	}

	var trackDiff = newIndex - index();

	// No shuffle / unshuffle occurred, and we're just restarting a track
	if (trackDiff == 0 && justRemade == false)
	{
		resetPosition();
		if ((bForcePlay == true) || sources[index()].isPlayActive())
		{
			sources[newIndex].play();
		}
	}

	// A shuffle or an unshuffle just occurred
	else if ( justRemade == true ) {
		that.tracks.set(newIndex);
		sources[newIndex].load(that.tracks.files()[newIndex]);
		sources[newIndex].play();

		updateDisplay();
	}

	// A normal track change just occurred
	else
	{
		var oldIndex = index();
	        that.tracks.set(newIndex);
		// Cancel any track that's in loading state right now
		if (sources[oldIndex].getState() == Gapless5State.Loading)
		{
			sources[oldIndex].cancelRequest();
			// TODO: better way to have just the file list?
			that.loadQueue.push([oldIndex, that.tracks.files()[oldIndex]]);
		}

		resetPosition(true); // make sure this comes after currentIndex has been updated
		if (sources[newIndex].getState() == Gapless5State.None)
		{
			// TODO: better way to have just the file list?
			sources[newIndex].load(that.tracks.files()[newIndex]);

			//re-sort queue so that this track is at the head of the list
			for (var i in that.loadQueue)
			{
				var entry = that.loadQueue.shift();
				if (entry[0] == newIndex)
				{
					break;
				}
				that.loadQueue.push(entry);
			}
		}
		updateDisplay();
		
		if ((bForcePlay == true) || sources[oldIndex].isPlayActive())
		{
			sources[newIndex].play();
		}
		sources[oldIndex].stop(); // call this last

	}
	enableButton('prev', that.loop || (newIndex > 0));
	enableButton('next', that.loop || (newIndex < numTracks() - 1));
};

this.prevtrack = function (e) {
	if (sources.length == 0) return;
	if (index() > 0)
	{
		that.gotoTrack(index() - 1);
		runCallback(that.onprev);
	}
	else if (that.loop)
	{
		that.gotoTrack(numTracks() - 1);
		runCallback(that.onprev);
	}
};

this.prev = function (e) {
	if (sources.length == 0) return;
	if (sources[index()].getPosition() > 0)
	{
		// jump to start of track if we're not there
		that.gotoTrack(index());
	}
	else if (index() > 0)
	{
		that.gotoTrack(index() - 1);
		runCallback(that.onprev);
	}
	else if (that.loop)
	{
		that.gotoTrack(numTracks() - 1);
		runCallback(that.onprev);
	}
};

this.next = function (e) {
	if (sources.length == 0) return;
	var bForcePlay = (e == true);
	if (index() < numTracks() - 1)
	{
		that.gotoTrack(index() + 1, bForcePlay);
		runCallback(that.onnext);
	}
	else if (that.loop)
	{
		that.gotoTrack(0, bForcePlay);
		runCallback(that.onnext);
	}
};

this.play = function (e) {
	if (sources.length == 0) return;
	if (sources[index()].audioFinished)
	{
		that.next(true);
	}
	else
	{
		sources[index()].play();
	}
	runCallback(that.onplay);
};

this.playpause = function (e) {
	if (isPlayButton)
		that.play(e);
	else
		that.pause(e);
}

this.cue = function (e) {
	if (!isPlayButton)
	{
		that.prev(e);
	}
	else if (sources[index()].getPosition() > 0)
	{
		that.prev(e);
		that.play(e);
	}
	else
	{
		that.play(e);
	}
}

this.pause = function (e) {
	if (sources.length == 0) return;
	sources[index()].stop();
	runCallback(that.onpause);
};

this.stop = function (e) {
	if (sources.length == 0) return;
	resetPosition();
	sources[index()].stop(true);
	runCallback(that.onstop);
};


// (PUBLIC) QUERIES AND CALLBACKS

this.isPlaying = function () {
	return sources[index()].inPlayState();
};

// INIT AND UI

var resetPosition = function(forceScrub) {
	if (!forceScrub && sources[index()].getPosition() == 0) return; // nothing else to do
	that.scrub(0);
	$("#transportbar" + that.id).val(0);
};

var enableButton = function (buttonId, bEnable) {
	if (bEnable)
	{
		$("#" + buttonId + that.id).removeClass('disabled');
		$("#" + buttonId + that.id).addClass('enabled');
	}
	else
	{
		$("#" + buttonId + that.id).removeClass('enabled');
		$("#" + buttonId + that.id).addClass('disabled');
	}
};

var updateDisplay = function () {
	if (numTracks() == 0)
	{
		$("#trackIndex" + that.id).html(0);
		$("#tracks" + that.id).html(0);
		$("#totalPosition" + that.id).html("00:00.00");
		enableButton('prev', false);
		enableButton('shuffle', false);
		enableButton('next', false);
	}
	else
	{
		$("#trackIndex" + that.id).html(that.tracks.displayIndex);
		$("#tracks" + that.id).html(numTracks());
		$("#totalPosition" + that.id).html(getTotalPositionText());
		enableButton('prev', that.loop || index() > 0 || sources[index()].getPosition() > 0);
		enableButton('next', that.loop || index() < numTracks() - 1);

		if (sources[index()].inPlayState())
		{
			enableButton('play', false);
			isPlayButton = false;
		}
		else
		{
			enableButton('play', true);
			isPlayButton = true;

			if (sources[index()].getState() == Gapless5State.Error)
			{
				runCallback(that.onerror);
			}
		}
		if ( that.tracks.justShuffled() )
		{
			enableButton('shuffle', true);
			isShuffleButton = true;
		}
		else
		{
			enableButton('shuffle', false);
			isShuffleButton = false;
		}
		sources[index()].uiDirty = false;
	}
};

var Tick = function(tickMS) {
	if (numTracks() > 0)
	{
		sources[index()].tick();

		if (sources[index()].uiDirty)
		{
			updateDisplay();
		}
		if (sources[index()].inPlayState())
		{
			var soundPos = sources[index()].getPosition();
			if (isScrubbing)
			{
				// playing track, update bar position
				soundPos = scrubPosition;
			}
			$("#transportbar" + that.id).val(getUIPos());
			$("#currentPosition" + that.id).html(getFormattedTime(soundPos));
		}
	}
	window.setTimeout(function () { Tick(tickMS); }, tickMS);
};

var PlayerHandle = function() {
	return "GAPLESS5_PLAYERS[" + that.id + "]";
};

var Init = function(elem_id, options, tickMS) {
	if ($("#" + elem_id).length == 0)
	{
		console.log("ERROR in Gapless5: no element with id '" + elem_id + "' exists!");
		return;
	}
	GAPLESS5_PLAYERS[that.id] = that;

	// generate html for player
	player_html = '<div class="g5position">';
	player_html += '<span id="currentPosition' + that.id + '">00:00.00</span> | <span id="totalPosition' + that.id + '">' + LOAD_TEXT + '</span>';
	player_html += ' | <span id="trackIndex' + that.id + '">1</span>/<span id="tracks' + that.id + '">1</span>';
	player_html += '</div>';
	
	player_html += '<div class="g5inside">';
	if (typeof Audio == "undefined")
	{
		player_html += 'This player is not supported by your browser.';
		player_html += '</div>';
		$("#" + elem_id).html(player_html);
		return;
	}
	player_html += '<div class="g5transport">';
	player_html += '<div class="g5meter"><span id="loaded-span' + that.id + '" style="width: 0%"></span></div>';

	player_html += '<input type="range" class="transportbar" name="transportbar" id="transportbar' + that.id + '" ';
	player_html += 'min="0" max="' + SCRUB_RESOLUTION + '" value="0" oninput="' + PlayerHandle() + '.scrub(this.value);" ';
	player_html += 'onmousedown="' + PlayerHandle()   + '.onStartedScrubbing();" ontouchstart="' + PlayerHandle() + '.onStartedScrubbing();" ';
	player_html += 'onmouseup="'   + PlayerHandle()   + '.onFinishedScrubbing();" ontouchend="'  + PlayerHandle() + '.onFinishedScrubbing();" />';

	player_html += '</div>';
	player_html += '<div class="g5buttons" id="g5buttons' + that.id + '">';
	player_html += '<button class="g5button g5prev" id="prev' + that.id + '"/>';
	player_html += '<button class="g5button g5play" id="play' + that.id + '"/>';
	player_html += '<button class="g5button g5stop" id="stop' + that.id + '"/>';
	player_html += '<button class="g5button g5shuffle" id="shuffle' + that.id + '"/>';
	player_html += '<button class="g5button g5next" id="next' + that.id + '"/>';

	if (isMobileBrowser)
	{
		player_html += '<button class="g5button volumedisabled" />';
		player_html += '</div>';
	}
	else
	{
		player_html += '<input type="range" class="volume" name="gain" min="0" max="' + SCRUB_RESOLUTION + '" value="' + SCRUB_RESOLUTION + '" oninput="' + PlayerHandle() + '.setGain(this.value);" />';
		player_html += '</div>';
	}
	player_html += '</div>';
	$("#" + elem_id).html(player_html);

	// css adjustments
	if (!isMobileBrowser && navigator.userAgent.indexOf('Mac OS X') == -1)
	{
		$("#transportbar" + that.id).addClass("g5meter-1pxup");
		$("#g5buttons" + that.id).addClass("g5buttons-1pxup");
	}
	if (isMobileBrowser)
	{
		$("#transportbar" + that.id).addClass("g5transport-1pxup");
	}

	// set up button mappings
	$('#prev' + that.id)[0].addEventListener("mousedown", GAPLESS5_PLAYERS[that.id].prev);
	$('#play' + that.id)[0].addEventListener("mousedown", GAPLESS5_PLAYERS[that.id].playpause);
	$('#stop' + that.id)[0].addEventListener("mousedown", GAPLESS5_PLAYERS[that.id].stop);
	$('#shuffle' + that.id)[0].addEventListener("mousedown", GAPLESS5_PLAYERS[that.id].shuffleToggle);
	$('#next' + that.id)[0].addEventListener("mousedown", GAPLESS5_PLAYERS[that.id].next);

	// set up key mappings
	if (options != null && 'mapKeys' in options)
	{
		that.mapKeys(options['mapKeys']);
	}
	$(window).keydown(function(e){
		var keycode = e.keyCode;
    	if (keycode in keyMappings)
    	{
    		keyMappings[keycode](e);
    	}
	});

	SCRUB_WIDTH = $("#transportbar" + that.id).width();
	enableButton('play', true);
	enableButton('stop', true);

	// set up starting track number
	if ( options != null && 'startingTrack' in options)
	{
		if (typeof options.startingTrack == 'number')
		{
			that.startingTrack = options.startingTrack;
		}
	}

	// set up tracks into a FileList object
	if ( options != null && 'tracks' in options)
	{
		if (typeof options.tracks == 'string')
		{
			// convert single track into a one-item filelist.
			// TODO: test
			var item = {};
			item.file = options.tracks;
			that.tracks = new Gapless5FileList(item, 0);
			that.addTrack(that.tracks.files()[0]);
		}
		if (typeof options.tracks == "object")
		{
			that.tracks = new Gapless5FileList(options.tracks, that.startingTrack);
			for (var i = 0; i < that.tracks.files().length ; i++ )
			{
				that.addTrack(that.tracks.files()[i]);
			}
		}
	}

	initialized = true;
	updateDisplay();

	// autostart if desired
	var playOnLoad = (options != undefined) && ('playOnLoad' in options) && (options.playOnLoad == true);
	if (playOnLoad && (that.count > 0))
	{
		sources[index()].play();
	}
	Tick(tickMS);
};

$(document).ready(Init(elem_id, options, this.tickMS));

};
