
export function isObscured(element, offset) {
    // default to the center of the element
    offset = offset || {
        top: Math.round(element.offsetHeight / 2),
        left: Math.round(element.offsetWidth / 2)
    };
    let position = findPosition(element, true);
    let elem = document.elementFromPoint(position.left + offset.left, position.top + offset.top);
    return !element.contains(elem)
}

// get the position of an element on the page
export function findPosition(element, excludeScroll = false) {
	var offset = { top: 0, left: 0 };
	var scroll = { top: 0, left: 0 };
    let offsetParent = element;
    while (offsetParent) {
        // we need to check every element for scrollTop/scrollLeft
        scroll.left += element.scrollLeft || 0;
        scroll.top += element.scrollTop || 0;
        // but only the original element and offsetParents for offsetTop/offsetLeft
        if (offsetParent === element) {
    		offset.left += element.offsetLeft;
    		offset.top += element.offsetTop;
            offsetParent = element.offsetParent;
        }
        element = element.parentNode;
    }
    if (excludeScroll) {
        offset.left -= scroll.left;
        offset.top -= scroll.top;
    }
    return offset;
}

// based on http://stackoverflow.com/a/38039019/113
export function elementIsInView(element, percentX = 1, percentY = 1) {
    const tolerance = 0.01;   //needed because the rects returned by getBoundingClientRect provide the position up to 10 decimals

    const elementRect = element.getBoundingClientRect();
    const parentRects = [];

    while (element.parentElement != null) {
        parentRects.push(element.parentElement.getBoundingClientRect());
        element = element.parentElement;
    }

    return parentRects.every((parentRect) => {
        const visiblePixelX = Math.min(elementRect.right, parentRect.right) - Math.max(elementRect.left, parentRect.left);
        const visiblePixelY = Math.min(elementRect.bottom, parentRect.bottom) - Math.max(elementRect.top, parentRect.top);
        const visiblePercentageX = visiblePixelX / elementRect.width;
        const visiblePercentageY = visiblePixelY / elementRect.height;
        return visiblePercentageX + tolerance > percentX && visiblePercentageY + tolerance > percentY;
    });
}

export function getSelectionPosition(element) {
    // input, textarea, IE
    if (element.setSelectionRange || element.createTextRange) {
        return [element.selectionStart, element.selectionEnd];
    }
    // contenteditable
    else {
        try {
            const selection = window.getSelection();
            const range = selection.getRangeAt(0);
            const { startContainer, startOffset } = range;
            range.setStart(element, 0);
            const end = range.toString().length;
            range.setEnd(startContainer, startOffset);
            const start = range.toString().length;

            return [start, end];
        } catch (e) {
            return [0, 0];
        }
    }
}

export function setSelectionPosition(element, [start, end]) {
    // input, textarea
    if (element.setSelectionRange) {
        element.focus();
        element.setSelectionRange(start, end);
    }
    // IE
    else if (element.createTextRange) {
        const range = element.createTextRange();
        range.collapse(true);
        range.moveEnd("character", end);
        range.moveStart("character", start);
        range.select();
    }
    // contenteditable
    else {
        const selection = window.getSelection();
        const startPos = getTextNodeAtPosition(element, start);
        const endPos = getTextNodeAtPosition(element, end);
        selection.removeAllRanges();
        const range = new Range();
        range.setStart(startPos.node, startPos.position);
        range.setEnd(endPos.node, endPos.position);
        selection.addRange(range);
    }
}

export function saveSelection(element) {
    let range = getSelectionPosition(element);
    return () => setSelectionPosition(element, range);
}

export function getCaretPosition(element) {
    return getSelectionPosition(element)[1];
}

export function setCaretPosition(element, position) {
    setSelectionPosition(element, [position, position]);
}

export function saveCaretPosition(element) {
    let position = getCaretPosition(element);
    return () => setCaretPosition(element, position);
}

function getTextNodeAtPosition(root, index) {
    let treeWalker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, (elem) => {
        if (index > elem.textContent.length){
            index -= elem.textContent.length;
            return NodeFilter.FILTER_REJECT
        }
        return NodeFilter.FILTER_ACCEPT;
    });
    var c = treeWalker.nextNode();
    return {
        node: c ? c : root,
        position: c ? index :  0
    };
}
