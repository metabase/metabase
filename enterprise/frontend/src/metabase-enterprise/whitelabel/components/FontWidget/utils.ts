import { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import { useAdminSetting } from "metabase/api/utils";
import type { FontFile, FontFormat } from "metabase-types/api";

import type { FontFileOption } from "./types";

/** Slot keys used to identify Regular, Bold, and Heavy rows (default weights). */
const SLOT_KEYS = [400, 700, 900] as const;

export const useGetFontOptions = () => {
  const { value: availableFonts } = useAdminSetting("available-fonts");
  const options = useMemo(
    () => [
      ...(availableFonts ?? []).map((font) => ({ label: font, value: font })),
      { label: t`Custom…`, value: "custom" },
    ],
    [availableFonts],
  );
  return options;
};

export interface FontSlot {
  slotKey: (typeof SLOT_KEYS)[number];
  url: string;
  weight: number;
}

/**
 * Map saved font files to the three slots (Regular, Bold, Heavy) by sorted
 * weight so we can show and edit url + weight per row and respect the font’s
 * actual weights (e.g. Bold can be 600 instead of 700).
 */
export const getFontSlots = (files: FontFile[] | null | undefined): FontSlot[] => {
  if (!files?.length) {
    return SLOT_KEYS.map((slotKey) => ({
      slotKey,
      url: "",
      weight: slotKey,
    }));
  }
  const sorted = [...files].sort((a, b) => a.fontWeight - b.fontWeight);
  return SLOT_KEYS.map((slotKey, index) => {
    const file = sorted[index];
    return {
      slotKey,
      url: file?.src ?? "",
      weight: file?.fontWeight ?? slotKey,
    };
  });
};

export const getFontUrls = (files: FontFile[]): Record<string, string> => {
  return _.chain(files)
    .indexBy((file) => file.fontWeight)
    .mapObject((file) => file.src)
    .value();
};

export const getFontOptions = (): FontFileOption[] => [
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

/**
 * Build FontFile[] from slot data so we persist each file with its chosen
 * weight (e.g. Bold row can be 600), respecting the font’s actual weights.
 */
export const getFontFilesFromSlots = (slots: FontSlot[]): FontFile[] => {
  return slots
    .filter((slot) => Boolean(slot.url?.trim()))
    .map((slot) => ({
      src: slot.url.trim(),
      fontWeight: slot.weight,
      fontFormat: getFontFormat(slot.url),
    }));
};

export const getFontFiles = (urls: Record<string, string>): FontFile[] => {
  return getFontOptions()
    .map((option) => ({
      src: urls[option.fontWeight],
      option,
    }))
    .filter(({ src }) => Boolean(src))
    .map(({ src, option }) => getFontFile(src, option.fontWeight));
};

const getFontFile = (
  src: string,
  fontWeight: number,
): FontFile => ({
  src,
  fontWeight,
  fontFormat: getFontFormat(src),
});

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
