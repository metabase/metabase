// taken from
// https://github.com/cypress-io/cypress/issues/27415#issuecomment-2169155274 to
// address issues with ResizeObserver in cypress that causes Chrome Rendering
// process crash and replayio failure

// store real observer
const RealResizeObserver = ResizeObserver;

let queueFlushTimeout;
let queue = [];

/**
 * ResizeObserver wrapper with "enforced batches"
 */
class ResizeObserverPolyfill {
  constructor(callback) {
    this.callback = callback;
    this.observer = new RealResizeObserver(this.check.bind(this));
  }

  observe(element) {
    this.observer.observe(element);
  }

  unobserve(element) {
    this.observer.unobserve(element);
  }

  disconnect() {
    this.observer.disconnect();
  }

  check(entries) {
    // remove previous invocations of "self"
    queue = queue.filter(x => x.cb !== this.callback);
    // put a new one
    queue.push({ cb: this.callback, args: entries });
    // trigger update
    if (!queueFlushTimeout) {
      queueFlushTimeout = requestAnimationFrame(() => {
        queueFlushTimeout = undefined;
        const q = queue;
        queue = [];
        q.forEach(({ cb, args }) => cb(args));
      }, 0);
    }
  }
}

window.ResizeObserver = ResizeObserverPolyfill;
