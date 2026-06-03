import { repairMarkdown } from "./repairMarkdown";

describe("repairMarkdown", () => {
  it("leaves balanced markdown untouched", () => {
    const text = "A **bold** word and `code` and [link](http://x.com).";
    expect(repairMarkdown(text)).toBe(text);
  });

  it("closes a dangling bold marker", () => {
    expect(repairMarkdown("this is **important")).toBe("this is **important**");
  });

  it("closes a dangling italic marker", () => {
    expect(repairMarkdown("this is *emph")).toBe("this is *emph*");
  });

  it("closes a dangling strikethrough marker", () => {
    expect(repairMarkdown("this is ~~gone")).toBe("this is ~~gone~~");
  });

  it("closes a dangling inline code span", () => {
    expect(repairMarkdown("call `foo")).toBe("call `foo`");
  });

  it("does not close emphasis inside an open fenced code block", () => {
    const text = "```js\nconst a = b * c * d";
    expect(repairMarkdown(text)).toBe(text);
  });

  it("strips an incomplete link destination back to its label", () => {
    expect(repairMarkdown("see [the docs](http://exa")).toBe("see the docs");
  });

  it("strips an incomplete link with no closing bracket", () => {
    expect(repairMarkdown("see [the docs")).toBe("see the docs");
  });

  it("removes an incomplete image", () => {
    expect(repairMarkdown("before ![alt")).toBe("before ");
  });

  it("does not treat intraword underscores as emphasis", () => {
    const text = "the column some_long_name is here";
    expect(repairMarkdown(text)).toBe(text);
  });

  it("ignores escaped emphasis markers", () => {
    const text = "literal \\* asterisk";
    expect(repairMarkdown(text)).toBe(text);
  });

  it("ignores emphasis markers inside completed inline code", () => {
    const text = "use `a * b` to multiply";
    expect(repairMarkdown(text)).toBe(text);
  });
});
