import { definePluginSlot, resetPluginSlots } from "metabase/plugin-slots";

describe("resetPluginSlots", () => {
  it.each(["toString", "constructor", "hasOwnProperty"])(
    "should remove an added own property named %s",
    (key) => {
      const slot = definePluginSlot(() => ({}));
      Object.assign(slot, { [key]: () => "enterprise" });

      resetPluginSlots();

      expect(Object.hasOwn(slot, key)).toBe(false);
      expect(Object.keys(slot)).toEqual([]);
    },
  );

  it("should restore an own default that shadows an inherited property", () => {
    const slot = definePluginSlot(() => ({ toString: () => "default" }));
    slot.toString = () => "enterprise";

    resetPluginSlots();

    expect(Object.hasOwn(slot, "toString")).toBe(true);
    expect(slot.toString()).toBe("default");
  });
});
