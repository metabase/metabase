import { getSize, type MantineSize, rem } from "@mantine/core";

const FONT_SIZES = {
  xs: rem(12),
  md: rem(14),
};

const LINE_HEIGHTS = {
  xs: rem(16),
  md: rem(24),
};

export function getItemFontSize(size: MantineSize | number): string {
  return getSize({ size, sizes: FONT_SIZES });
}

export function getItemLineHeight(size: MantineSize | number): string {
  return getSize({ size, sizes: LINE_HEIGHTS });
}
