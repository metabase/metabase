import { formatUrl } from "./url";

// Pure engine behaviour only. The jsx + rich rendering paths (link components,
// SDK click handling, safety guards in the presence of a real renderer) are
// tested in visualizations/lib/register-jsx-formatting.unit.spec.tsx.
describe("formatUrl", () => {
  it("should return a string when not in jsx mode", () => {
    expect(formatUrl("http://metabase.com/")).toEqual("http://metabase.com/");
  });
});
