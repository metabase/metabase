import { cdnKey, imageSize, rewriteMarkdown } from "./docs-images-cdn";

describe("rewriteMarkdown", () => {
  const urls = new Map([
    ["docs/questions/images/a.png", "https://cdn.metabase.com/docs/h1/a.png"],
    ["docs/dashboards/images/b.gif", "https://cdn.metabase.com/docs/h2/b.gif"],
  ]);

  it("rewrites ./, ../ and bare paths, keeping titles", () => {
    const { text, used } = rewriteMarkdown(
      [
        "![A](./images/a.png)",
        '![A](images/a.png "Title")',
        "[B](../dashboards/images/b.gif)",
      ].join("\n"),
      "docs/questions/page.md",
      urls,
    );
    expect(text).toBe(
      [
        "![A](https://cdn.metabase.com/docs/h1/a.png)",
        '![A](https://cdn.metabase.com/docs/h1/a.png "Title")',
        "[B](https://cdn.metabase.com/docs/h2/b.gif)",
      ].join("\n"),
    );
    expect([...used].sort()).toEqual([
      "docs/dashboards/images/b.gif",
      "docs/questions/images/a.png",
    ]);
  });

  it("resolves links from the repo root README", () => {
    const { text } = rewriteMarkdown(
      "![A](./docs/questions/images/a.png)",
      "README.md",
      urls,
    );
    expect(text).toBe("![A](https://cdn.metabase.com/docs/h1/a.png)");
  });

  it("matches URL-encoded paths", () => {
    const { text, used } = rewriteMarkdown(
      "![S](./images/my%20shot.png)",
      "docs/questions/page.md",
      new Map([
        [
          "docs/questions/images/my shot.png",
          "https://cdn.metabase.com/docs/h3/my-shot.png",
        ],
      ]),
    );
    expect(text).toBe("![S](https://cdn.metabase.com/docs/h3/my-shot.png)");
    expect(used.size).toBe(1);
  });

  it("keeps a #fragment or ?query after the CDN URL", () => {
    const { text, used } = rewriteMarkdown(
      [
        "![A](./images/a.png#section)",
        "![A](./images/a.png?raw=true)",
        "![A](./images/a.png?raw=true#gh-dark-mode-only)",
        "[A](./images/a.png#gh-dark-mode-only)",
      ].join("\n"),
      "docs/questions/page.md",
      urls,
    );
    expect(text).toBe(
      [
        "![A](https://cdn.metabase.com/docs/h1/a.png#section)",
        "![A](https://cdn.metabase.com/docs/h1/a.png?raw=true)",
        "![A](https://cdn.metabase.com/docs/h1/a.png?raw=true#gh-dark-mode-only)",
        "[A](https://cdn.metabase.com/docs/h1/a.png#gh-dark-mode-only)",
      ].join("\n"),
    );
    expect(used.size).toBe(1);
  });

  it("wraps theme-only images in a link so GitHub can hide them", () => {
    const { text } = rewriteMarkdown(
      [
        "![D](./images/a.png#gh-dark-mode-only)",
        "![L](../dashboards/images/b.gif#gh-light-mode-only)",
        '![T](./images/a.png#gh-dark-mode-only "Title")',
      ].join("\n"),
      "docs/questions/page.md",
      urls,
    );
    expect(text).toBe(
      [
        "[![D](https://cdn.metabase.com/docs/h1/a.png)](https://cdn.metabase.com/docs/h1/a.png#gh-dark-mode-only)",
        "[![L](https://cdn.metabase.com/docs/h2/b.gif)](https://cdn.metabase.com/docs/h2/b.gif#gh-light-mode-only)",
        '[![T](https://cdn.metabase.com/docs/h1/a.png "Title")](https://cdn.metabase.com/docs/h1/a.png#gh-dark-mode-only)',
      ].join("\n"),
    );
  });

  it("doesn't wrap an image that's already linked", () => {
    const { text } = rewriteMarkdown(
      "[![D](./images/a.png)](./images/a.png#gh-dark-mode-only)",
      "docs/questions/page.md",
      urls,
    );
    expect(text).toBe(
      "[![D](https://cdn.metabase.com/docs/h1/a.png)](https://cdn.metabase.com/docs/h1/a.png#gh-dark-mode-only)",
    );
  });

  it("leaves external, site-root and unknown links alone", () => {
    const text = [
      "![x](https://example.com/a.png)",
      "![x](/questions/images/a.png)",
      "![x](./images/other.png)",
      "[page](./other.md)",
    ].join("\n");
    const result = rewriteMarkdown(text, "docs/questions/page.md", urls);
    expect(result.text).toBe(text);
    expect(result.used.size).toBe(0);
  });
});

describe("cdnKey", () => {
  it("is the sha256 directory plus a URL-safe basename", () => {
    expect(cdnKey(Buffer.from("hello"), "docs/x/y z.png")).toBe(
      "docs/2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824/y-z.png",
    );
  });
});

describe("imageSize", () => {
  it("reads PNG and GIF headers", () => {
    const png = Buffer.alloc(24);
    Buffer.from("\x89PNG\r\n\x1a\n", "latin1").copy(png);
    png.writeUInt32BE(1280, 16);
    png.writeUInt32BE(720, 20);
    expect(imageSize(png)).toEqual({ width: 1280, height: 720 });

    const gif = Buffer.alloc(10);
    gif.write("GIF89a", "latin1");
    gif.writeUInt16LE(400, 6);
    gif.writeUInt16LE(300, 8);
    expect(imageSize(gif)).toEqual({ width: 400, height: 300 });
  });

  it("rejects anything else", () => {
    expect(() => imageSize(Buffer.alloc(24))).toThrow();
  });
});
