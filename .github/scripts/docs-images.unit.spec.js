const {
  shouldConvert,
  imageInfo,
  pointerFor,
  isPointer,
} = require("./docs-images");

const png = Buffer.alloc(33);
Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
png.write("IHDR", 12, "latin1");
png.writeUInt32BE(1280, 16);
png.writeUInt32BE(720, 20);

const gif = Buffer.alloc(13);
gif.write("GIF89a", 0, "latin1");
gif.writeUInt16LE(640, 6);
gif.writeUInt16LE(480, 8);

describe("imageInfo", () => {
  it("reads PNG and GIF dimensions", () => {
    expect(imageInfo(png)).toEqual({
      type: "image/png",
      width: 1280,
      height: 720,
    });
    expect(imageInfo(gif)).toEqual({
      type: "image/gif",
      width: 640,
      height: 480,
    });
  });

  it("throws on anything else", () => {
    expect(() => imageInfo(Buffer.from("<svg/>"))).toThrow();
  });
});

describe("pointerFor and isPointer", () => {
  it("writes a pointer that isPointer recognizes", () => {
    const pointer = pointerFor(
      "89a68d3032642dcc05f66e57639dacfa4a7be195e4c57ea3738d29c91f8c1c6c",
      png.length,
      imageInfo(png),
    );
    expect(pointer).toBe(
      "sha256 89a68d3032642dcc05f66e57639dacfa4a7be195e4c57ea3738d29c91f8c1c6c\nsize 33\nwidth 1280\nheight 720\n",
    );
    expect(isPointer(Buffer.from(pointer))).toBe(true);
    expect(isPointer(png)).toBe(false);
    expect(isPointer(Buffer.from(`${pointer}extra\n`))).toBe(false);
  });
});

describe("shouldConvert", () => {
  it("matches PNGs and GIFs under docs/ except the kept ones", () => {
    expect(shouldConvert("docs/questions/images/chart.png")).toBe(true);
    expect(shouldConvert("docs/images/loading.GIF")).toBe(true);
    expect(shouldConvert("docs/images/logo.svg")).toBe(false);
    expect(shouldConvert("frontend/res/chart.png")).toBe(false);
    expect(
      shouldConvert("docs/images/metabase-product-screenshot-updated.png"),
    ).toBe(false);
  });
});
