import { getDataAppStatusLabel, isDataAppOpenable } from "./utils";

describe("getDataAppStatusLabel", () => {
  it.each([
    { enabled: true, outdated: false, label: "Live" },
    { enabled: false, outdated: false, label: "Draft" },
    { enabled: true, outdated: true, label: "Live, outdated" },
    { enabled: false, outdated: true, label: "Draft, outdated" },
  ])(
    "returns $label when enabled is $enabled and outdated is $outdated",
    ({ enabled, outdated, label }) => {
      expect(getDataAppStatusLabel({ enabled, outdated })).toBe(label);
    },
  );
});

describe("isDataAppOpenable", () => {
  it.each([
    { enabled: true, outdated: false, isOpenable: true },
    { enabled: false, outdated: false, isOpenable: false },
    { enabled: true, outdated: true, isOpenable: false },
  ])(
    "returns $isOpenable when enabled is $enabled and outdated is $outdated",
    ({ enabled, outdated, isOpenable }) => {
      expect(isDataAppOpenable({ enabled, outdated })).toBe(isOpenable);
    },
  );
});
