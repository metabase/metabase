import { ResizeObserver as JuggleResizeObserver } from "@juggle/resize-observer";

type ResizeObserverCallback = (
  entry: ResizeObserverEntry,
  observer: ResizeObserver,
) => void;

// PR: https://github.com/metabase/metabase/pull/48227
// The SDK team needs to use the juggle resize observer right now because the SDK
// keeps overlaying errors of 'ResizeObserver loop completed with undelivered notifications'
// which is really messing up the user experience.
// With the window ResizeObserver, we were hitting these errors mostly on scalars and tables.
//
// This comes with some tradeoffs. On the SDK, there will be issues with scalars
// not rendering properly on the first render, as we rely on rapid resize observer
// updates to resize the text.
const isEmbeddingSdk =
  typeof process !== "undefined" && process.env?.IS_EMBEDDING_SDK === "true";
const ResizeObserverImpl = isEmbeddingSdk
  ? JuggleResizeObserver
  : window.ResizeObserver;

function createResizeObserver() {
  const callbacksMap: Map<unknown, ResizeObserverCallback[]> = new Map();

  function handler(entries: ResizeObserverEntry[], observer: ResizeObserver) {
    entries.forEach((entry) => {
      const entryCallbacks = callbacksMap.get(entry.target);
      entryCallbacks?.forEach((callback) => callback(entry, observer));
    });
  }

  const observer = new ResizeObserverImpl(handler);

  return {
    observer,
    subscribe(target: Element, callback: ResizeObserverCallback) {
      observer.observe(target);
      const callbacks = callbacksMap.get(target) ?? [];
      callbacks.push(callback);
      callbacksMap.set(target, callbacks);
    },
    unsubscribe(target: Element, callback: ResizeObserverCallback) {
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default createResizeObserver();
