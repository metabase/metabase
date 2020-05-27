import { t, jt, ngettext, msgid } from "ttag";

// a subclass of String to defer translating string until it's actually used a string
class DeferredTTagString extends String {
  constructor(func, args) {
    super();
    this._func = func;
    this._args = args;
  }
  // toPrimitive is tried before toString/valueOf
  [Symbol.toPrimitive](hint) {
    return this._func(...this._args);
  }
}

export function dt(...args) {
  return new DeferredTTagString(t, args);
}
export function djt(...args) {
  return new DeferredTTagString(jt, args);
}

export { ngettext, msgid, djt as jt, dt as t };
