import { reinitialize } from "metabase/plugins";

import { definePluginSlot } from "./slot";

describe("definePluginSlot", () => {
  it("should return the defaults", () => {
    const slot = definePluginSlot(() => ({ enabled: false, label: "default" }));

    expect(slot).toEqual({ enabled: false, label: "default" });
  });

  it("should restore the defaults and remove added keys on reinitialize", () => {
    const slot = definePluginSlot(() => ({ enabled: false, label: "default" }));

    slot.enabled = true;
    slot.label = "changed";
    Object.assign(slot, { extra: "added" });
    reinitialize();

    expect(slot).toEqual({ enabled: false, label: "default" });
    expect(Object.keys(slot)).toEqual(["enabled", "label"]);
  });

  it("should reset a slot defined after another one", () => {
    const first = definePluginSlot(() => ({ value: 1 }));
    const second = definePluginSlot(() => ({ value: 2 }));

    first.value = 10;
    second.value = 20;
    reinitialize();

    expect(first.value).toBe(1);
    expect(second.value).toBe(2);
  });

  it("should reset an array slot in place", () => {
    const slot = definePluginSlot((): string[] => []);
    const reference = slot;

    slot.push("a", "b");
    reinitialize();

    expect(slot).toEqual([]);
    expect(reference).toBe(slot);
  });

  it("should call getDefaults again on each reset", () => {
    const slot = definePluginSlot((): { items: string[] } => ({ items: [] }));

    slot.items.push("mutated");
    reinitialize();

    expect(slot.items).toEqual([]);
  });
});
