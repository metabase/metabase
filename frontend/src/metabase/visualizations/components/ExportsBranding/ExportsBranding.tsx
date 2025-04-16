import { t } from "ttag";

import LogoLarge from "assets/img/exports-branded-logo-l.svg";
import LogoSmall from "assets/img/exports-branded-logo-s.svg";

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

const svgToDataUrl = async (svgUrl: string): Promise<string> => {
  try {
    const response = await fetch(svgUrl);
    const svgText = await response.text();
    const dataUrl = `data:image/svg+xml;base64,${btoa(svgText)}`;
    return dataUrl;
  } catch (error) {
    console.error("Error converting SVG to data URL:", error);
    return svgUrl;
  }
};

export const getFooterConfig = (size: FooterSize) => {
  const sizes = ["xs", "s", "m", "l", "xl", "xxl", "xxxl"];
  const sizeIndex = sizes.indexOf(size);

  const fzValues = [8, 16, 12, 24, 32, 32, 48];
  const marginValues = [0, 16, 8, 24, 32, 32, 48];
  const paddingValues = [8, 16, 24, 24, 32, 32, 48];
  const heightValues = [32, 32, 52, 60, 84, 112, 144];

  return {
    fz: fzValues[sizeIndex],
    m: marginValues[sizeIndex],
    p: paddingValues[sizeIndex],
    h: heightValues[sizeIndex],
  };
};

export const createFooterElement = async (size: FooterSize) => {
  const { fz, h, m, p } = getFooterConfig(size);

  const footer = document.createElement("div");
  footer.style.cssText = `
    font-family: "Lato", sans-serif;
    font-size: ${fz}px;
    color: var(--mb-color-text-light);
    height: ${h}px;
    width: 100%;
    padding-inline: ${p}px;
    display: flex;
    align-items: center;
    justify-content: ${size === "xs" ? "center" : "flex-end"};
    background-color: red; // FIXME: debugging only
    z-index: 1000;
    position: absolute;
    bottom: -${h}px;
    left: 0;
  `;

  if (size !== "xs") {
    const footerText = document.createElement("span");
    footerText.textContent = t`Made with`;
    footerText.style.marginInlineEnd = `${m}px`;
    footer.appendChild(footerText);
  }

  const logoUrl = size === "l" ? LogoLarge : LogoSmall;
  const logoDataUrl = await svgToDataUrl(logoUrl);

  const logo = document.createElement("img");
  logo.src = logoDataUrl;
  // eslint-disable-next-line no-literal-metabase-strings -- This is used only in non-whitelabeled instances!
  logo.alt = t`Metabase company logo`;
  footer.appendChild(logo);

  return footer;
};
