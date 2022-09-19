import Base from "./Base";

describe("Base", () => {
  describe("instantiation", () => {
    it("should set properties from `object` on the Base instance", () => {
      const object = {
        abc: 123,
      };
      const instance = new Base(object);
      expect(instance.abc).toEqual(object.abc);
    });

    it("should set ALL enumerable properties of `object`, including properties down the prototype chain", () => {
      const object = {
        abc: 123,
        __proto__: {
          secretPrototypeValue: true,
        },
      };
      Object.defineProperty(object, "anEnumerableProperty", {
        enumerable: false,
        value: false,
      });
      // object.__proto__ = {
      //   secretPrototypeValue: true,
      // };

      const instance = new Base(object);
      expect(instance.abc).toEqual(object.abc);
      expect(instance.secretPrototypeValue).toBe(true);
      expect(instance.anEnumerableProperty).toBeUndefined();
    });
  });

  describe("displayName", () => {
    it("should return the correct name", () => {
      const object = {
        abc: 123,
        name: "TheBaseNameProperty",
      };
      const instance = new Base(object);
      expect(instance.displayName()).toEqual(object.name);
    });

    it("should return the name fallback", () => {
      const object = {
        abc: 123,
      };
      const instance = new Base(object);
      expect(instance.displayName()).toEqual(`Base.name is undefined`);
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
