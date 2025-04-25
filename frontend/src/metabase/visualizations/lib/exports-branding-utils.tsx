import ReactDOMServer from "react-dom/server";
import { t } from "ttag";

import BrandingLogo from "metabase/public/components/EmbedFrame/LogoBadge/metabase_logo_with_text.svg?component";

type FooterSize = "xs" | "s" | "m" | "l" | "xl" | "xxl" | "xxxl";

export const getFooterSize = (width: number): FooterSize => {
  const sizes: [number, FooterSize][] = [
    [200, "xs"],
    [600, "s"],
    [960, "m"],
    [1280, "l"],
    [1600, "xl"],
    [1920, "xxl"],
  ];

  for (const [threshold, size] of sizes) {
    if (width < threshold) {
      return size;
    }
  }

  return "xxxl";
};

const svgComponentToBase64 = (Component: JSX.Element): string => {
  const svgString = ReactDOMServer.renderToStaticMarkup(Component);
  const encoded = Buffer.from(svgString, "utf-8").toString("base64");
  return `data:image/svg+xml;base64,${encoded}`;
};

type FooterConfig = {
  /** Font size */
  fz: number;
  /** Margin between the text and the logo (if any) */
  m: number;
  /** Footer padding */
  p: number;
  /** Footer height */
  h: number;
  /** Logo height */
  ly: number;
};

/**
 * Returns a configuration object for footer layout based on the given size.
 *
 * @param size - The desired footer size (e.g., 's', 'm', 'l', etc.)
 * @returns An object containing font size, margin, padding, height, and logo height.
 */
export const getFooterConfig = (size: FooterSize): FooterConfig => {
  const sizes = ["xs", "s", "m", "l", "xl", "xxl", "xxxl"];
  const sizeIndex = sizes.indexOf(size);

  const fzValues = [6, 6, 8, 12, 14, 16, 20];
  const marginValues = [0, 4, 6, 6, 12, 14, 20];
  const paddingValues = [8, 16, 24, 24, 32, 32, 48];
  const heightValues = [32, 32, 52, 60, 84, 112, 144];
  const logoHeights = [16, 16, 20, 28, 36, 48, 64];

  const getDimension = (values: number[]): number => values[sizeIndex];

  return {
    fz: getDimension(fzValues),
    m: getDimension(marginValues),
    p: getDimension(paddingValues),
    h: getDimension(heightValues),
    ly: getDimension(logoHeights),
  };
};

export const createFooterElement = (size: FooterSize) => {
  const { fz, h, ly, m, p } = getFooterConfig(size);

  const LOGO_ASCPECT_RATIO = 4.0625;
  const LOGO_HEIGHT = ly;
  const LOGO_WIDTH = LOGO_HEIGHT * LOGO_ASCPECT_RATIO;

  const LogoComponent = (
    <BrandingLogo width={LOGO_WIDTH} height={LOGO_HEIGHT} />
  );

  const footer = document.createElement("div");
  footer.style.cssText = `
    height: ${h}px;
    width: 100%;
    padding-inline: ${p}px;
    background-color: var(--mb-color-bg-dashboard);
    display: flex;
    align-items: center;
    justify-content: ${size === "xs" ? "center" : "flex-end"};
    z-index: 1000;
    position: absolute;
    bottom: -${h}px;
    left: 0;
  `;

  if (size !== "xs") {
    const footerText = document.createElement("span");
    footerText.textContent = t`Made with`;
    footerText.style.cssText = `
      font-family: "Lato", sans-serif;
      font-size: ${fz}px;
      color: var(--mb-color-text-medium);
      display: inline-block;
      margin-inline-end: ${m}px;
      vertical-align: middle;
      line-height: 1;
    `;
    footer.appendChild(footerText);
  }

  const logoDataUrl = svgComponentToBase64(LogoComponent);

  const logo = document.createElement("img");
  logo.src = logoDataUrl;
  // eslint-disable-next-line no-literal-metabase-strings -- This is used only in non-whitelabeled instances!
  logo.alt = t`Metabase company logo`;
  logo.width = LOGO_WIDTH;
  logo.height = LOGO_HEIGHT;

  footer.appendChild(logo);

  return footer;
};
