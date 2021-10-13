export default class Base {
  _plainObject = null;
  constructor(object = {}) {
    this._plainObject = object;
    for (const property in object) {
      this[property] = object[property];
    }
  }

  /**
   * Get the plain metadata object without hydrated fields.
   * Useful for situations where you want serialize the metadata object.
   */
  getPlainObject() {
    return this._plainObject;
  }
}
