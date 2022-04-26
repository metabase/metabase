type ResizeObserverCallback = (
  entry: ResizeObserverEntry,
  observer: ResizeObserver,
) => void;

function createResizeObserver() {
  const callbacksMap: Map<unknown, ResizeObserverCallback[]> = new Map();

  const observer = new ResizeObserver((entries, observer) => {
    for (let i = 0; i < entries.length; i++) {
      const entryCallbacks = callbacksMap.get(entries[i].target);
      entryCallbacks?.forEach(callback => callback(entries[i], observer));
    }
  });

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
