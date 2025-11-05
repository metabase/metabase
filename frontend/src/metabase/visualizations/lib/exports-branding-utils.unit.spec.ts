import {
  createBrandingElement,
  getBrandingConfig,
  getBrandingSize,
} from "./exports-branding-utils";

describe("getBrandingSize", () => {
  it("should return correct size for different widths", () => {
    expect(getBrandingSize(80)).toBe("xs");
    expect(getBrandingSize(199)).toBe("xs");
    expect(getBrandingSize(200)).toBe("s");
    expect(getBrandingSize(599)).toBe("s");
    expect(getBrandingSize(600)).toBe("m");
    expect(getBrandingSize(959)).toBe("m");
    expect(getBrandingSize(960)).toBe("l");
    expect(getBrandingSize(1279)).toBe("l");
    expect(getBrandingSize(1280)).toBe("xl");
    expect(getBrandingSize(1599)).toBe("xl");
    expect(getBrandingSize(1600)).toBe("xxl");
    expect(getBrandingSize(1919)).toBe("xxl");
    expect(getBrandingSize(1920)).toBe("xxxl");
    expect(getBrandingSize(2420)).toBe("xxxl");
  });
});

describe("getBrandingConfig", () => {
  it("should return correct config for xs size", () => {
    const config = getBrandingConfig("xs");
    expect(config).toEqual({
      fz: 6,
      m: 0,
      p: 8,
      h: 32,
      ly: 16,
    });
  });

  it("should return correct config for m size", () => {
    const config = getBrandingConfig("m");
    expect(config).toEqual({
      fz: 8,
      m: 6,
      p: 24,
      h: 52,
      ly: 20,
    });
  });

  it("should return correct config for xxxl size", () => {
    const config = getBrandingConfig("xxxl");
    expect(config).toEqual({
      fz: 20,
      m: 20,
      p: 48,
      h: 144,
      ly: 64,
    });
  });
});

describe("createBrandingElement", () => {
  it("should create a branding element with correct structure for xs size", () => {
    const element = createBrandingElement("xs");

    expect(element.tagName).toBe("DIV");
    expect(element).toHaveStyle({
      height: "32px",
      paddingInline: "8px",
      justifyContent: "center",
    });

    // Should only have logo for xs size
    expect(element.children.length).toBe(1);
    const logo = element.children[0] as HTMLImageElement;
    expect(logo.tagName).toBe("IMG");
    expect(logo.src).toMatch(/^data:image\/svg\+xml;base64,/);
  });

  it("should create a branding element with correct structure for m size", () => {
    const element = createBrandingElement("m");

    expect(element.tagName).toBe("DIV");
    expect(element).toHaveStyle({
      height: "52px",
      paddingInline: "24px",
      justifyContent: "flex-end",
    });

    // Should have both text and logo for all sizes above xs
    expect(element.children.length).toBe(2);
    const [text, logo] = element.children;
    expect(text.tagName).toBe("SPAN");
    expect(text).toHaveTextContent("Made with");
    expect(logo.tagName).toBe("IMG");
    expect((logo as HTMLImageElement).src).toMatch(
      /^data:image\/svg\+xml;base64,/,
    );
  });
});
