// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import Base from "./Base";
describe("Base", () => {
  describe("instantiation", () => {
    it("should set properties from `object` on the Base instance", () => {
      const instance = new Base({
        abc: 123,
      });
      expect(instance.abc).toEqual(123);
    });
    it("should set ALL enumerable properties of `object`, including properties down the prototype chain", () => {
      const object = {
        abc: 123,
      };
      Object.defineProperty(object, "anEnumerableProperty", {
        enumerable: false,
        value: false,
      });
      object.__proto__ = {
        secretPrototypeValue: true,
      };
      const instance = new Base(object);
      expect(instance.abc).toEqual(123);
      expect(instance.secretPrototypeValue).toBe(true);
      expect(instance.anEnumerableProperty).toBeUndefined();
    });
  });
  describe("getPlainObject", () => {
    it("returns whatever `object` was provided during instantiation", () => {
      const obj = {
        abc: 123,
      };
      const instance = new Base(obj);
      expect(instance.getPlainObject()).toBe(obj);
    });
    it("returns whatever `_plainObject` is set to", () => {
      const obj1 = {};
      const obj2 = {};
      const instance = new Base(obj1);
      instance._plainObject = obj2;
      expect(instance.getPlainObject()).toBe(obj2);
    });
  });
});
