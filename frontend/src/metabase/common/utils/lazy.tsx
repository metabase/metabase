export const callNow = (func: () => void) => func();
export const callLater = (callback: () => void) => {
  "requestIdleCallback" in window
    ? window.requestIdleCallback(callback)
    : setTimeout(callback, 1);
};
