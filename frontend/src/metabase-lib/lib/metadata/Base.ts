export default class Base {
  _plainObject: Record<string, unknown>;

  constructor(object = {}) {
    this._plainObject = object;
    Object.assign(this, object);
  }

  /**
   * Get the plain metadata object without hydrated fields.
   * Useful for situations where you want serialize the metadata object.
   */
  getPlainObject() {
    return this._plainObject;
  }
}
