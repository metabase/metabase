
export function requestFullscreen(element = document.documentElement) {
    for (let requestFullscreen of ["requestFullscreen", "webkitRequestFullscreen", "mozRequestFullScreen", "msRequestFullscreen"]) {
        if (typeof element[requestFullscreen] === "function") {
            element[requestFullscreen]();
            break;
        }
    }
}

export function exitFullscreen() {
    for (let exitFullscreen of ["exitFullscreen", "webkitExitFullscreen", "mozCancelFullScreen", "msExitFullscreen"]) {
        if (typeof document[exitFullscreen] === "function") {
            document[exitFullscreen]();
            break;
        }
    }
}
