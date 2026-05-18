type Listener = (...args: unknown[]) => void;

export class EventEmitter {
  private _listeners: Record<string, Listener[]> = {};

  on(event: string, fn: Listener): this {
    (this._listeners[event] ??= []).push(fn);
    return this;
  }

  off(event: string, fn: Listener): this {
    const list = this._listeners[event];
    if (list) {
      this._listeners[event] = list.filter(f => f !== fn);
    }
    return this;
  }

  emit(event: string, ...args: unknown[]): boolean {
    const list = this._listeners[event];
    if (!list?.length) {
      return false;
    }
    for (const fn of list) {
      fn(...args);
    }
    return true;
  }
}
