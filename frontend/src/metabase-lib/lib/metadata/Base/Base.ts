import { PlainObjectType } from "./types";

export default class Base {
  [key: string]: unknown;
  _plainObject: PlainObjectType;

  constructor(object: PlainObjectType = {}) {
    this._plainObject = object;

    for (const property in object) {
      this[property] = object[property];
    }
  }

  /**
   * Get the plain metadata object without hydrated fields.
   * Useful for situations where you want serialize the metadata object.
   */
  getPlainObject(): PlainObjectType {
    return this._plainObject;
  }
}
