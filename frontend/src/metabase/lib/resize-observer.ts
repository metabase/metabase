import uiThrottle from "raf-schd";
import { isCypressActive } from "metabase/env";

type ResizeObserverCallback = (
  entry: ResizeObserverEntry,
  observer: ResizeObserver,
) => void;

function createResizeObserver() {
  const callbacksMap: Map<unknown, ResizeObserverCallback[]> = new Map();

  function handler(entries: ResizeObserverEntry[], observer: ResizeObserver) {
    entries.forEach(entry => {
      const entryCallbacks = callbacksMap.get(entry.target);
      entryCallbacks?.forEach(callback => callback(entry, observer));
    });
  }

  const observer = new ResizeObserver(
    isCypressActive ? handler : uiThrottle(handler),
  );

  return {
    observer,
    subscribe(target: HTMLElement, callback: ResizeObserverCallback) {
      observer.observe(target);
      const callbacks = callbacksMap.get(target) ?? [];
      callbacks.push(callback);
      callbacksMap.set(target, callbacks);
    },
    unsubscribe(target: HTMLElement, callback: ResizeObserverCallback) {
      const callbacks = callbacksMap.get(target) ?? [];
      if (callbacks.length === 1) {
        observer.unobserve(target);
        callbacksMap.delete(target);
        return;
      }
      const cbIndex = callbacks.indexOf(callback);
      if (cbIndex !== -1) {
        callbacks.splice(cbIndex, 1);
      }
      callbacksMap.set(target, callbacks);
    },
  };
}

export default createResizeObserver();
