import { t } from "ttag";
import _ from "underscore";

import type { FontFile, FontFormat } from "metabase-types/api";

import type { FontFileOption } from "./types";

export const FONT_OPTIONS: FontFileOption[] = [
  {
    name: t`Regular`,
    fontWeight: 400,
  },
  {
    name: t`Bold`,
    fontWeight: 700,
  },
  {
    name: t`Heavy`,
    fontWeight: 900,
  },
];

export const getFontUrls = (files: FontFile[]): Record<string, string> => {
  return _.chain(files)
    .indexBy(file => file.fontWeight)
    .mapObject(file => file.src)
    .value();
};

export const getFontFiles = (urls: Record<string, string>): FontFile[] => {
  return FONT_OPTIONS.map(option => ({ src: urls[option.fontWeight], option }))
    .filter(({ src }) => Boolean(src))
    .map(({ src, option }) => getFontFile(src, option));
};

const getFontFile = (src: string, option: FontFileOption): FontFile => {
  return { src, fontWeight: option.fontWeight, fontFormat: getFontFormat(src) };
};

const getFontFormat = (src: string): FontFormat => {
  try {
    const url = new URL(src);
    const extension = url.pathname.substring(url.pathname.lastIndexOf("."));

    switch (extension) {
      case ".woff":
        return "woff";
      case ".woff2":
        return "woff2";
      case ".ttf":
        return "truetype";
      default:
        return "woff2";
    }
  } catch {
    return "woff2";
  }
};
