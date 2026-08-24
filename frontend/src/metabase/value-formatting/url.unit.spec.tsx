import { formatUrl } from "./url";

// Pure engine behaviour only. The jsx + rich rendering paths (link components,
// SDK click handling, safety guards in the presence of a real renderer) are
// tested in visualizations/lib/register-jsx-formatting.unit.spec.tsx.
describe("formatUrl", () => {
  it("should return a string when not in jsx mode", () => {
    expect(formatUrl("http://metabase.com/")).toEqual("http://metabase.com/");
  });

  it("should return the value, not the link_text, for plain text output", () => {
    const formatted = formatUrl("http://not.metabase.com", {
      link_text: "metabase link",
      link_url: "http://metabase.com",
      view_as: "link",
      clicked: {},
    });

    expect(formatted).toEqual("http://not.metabase.com");
  });

  it("should return the link_url instead of the value when copyLinkUrl is set", () => {
    const formatted = formatUrl("http://not.metabase.com", {
      link_text: "metabase link",
      link_url: "http://metabase.com",
      view_as: "link",
      clicked: {},
      copyLinkUrl: true,
    });

    expect(formatted).toEqual("http://metabase.com");
  });
});
