import Color from "color";
import { memo, useCallback, useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import { ColorPicker } from "metabase/common/components/ColorPicker";
import { useCurrentRef } from "metabase/common/hooks/use-current-ref";
import { Box, Flex } from "metabase/ui";
import { color } from "metabase/ui/colors";

import S from "./BrandColorSettings.module.css";
import type { ColorOption } from "./types";
import { getBrandColorOptions } from "./utils";

export interface BrandColorSettingsProps {
  colors: Record<string, string>;
  colorPalette: Record<string, string>;
  onChange: (colors: Record<string, string>) => void;
}

export const BrandColorSettings = ({
  colors,
  colorPalette,
  onChange,
}: BrandColorSettingsProps): JSX.Element => {
  const colorsRef = useCurrentRef(colors);
  const options = useMemo(getBrandColorOptions, []);

  const handleChange = useCallback(
    (colorName: string, color?: string) => {
      if (color) {
        onChange({ ...colorsRef.current, [colorName]: color });
      } else {
        onChange(_.omit(colorsRef.current, colorName));
      }
    },
    [colorsRef, onChange],
  );

  return (
    <BrandColorTable
      colors={colors}
      colorPalette={colorPalette}
      options={options}
      onChange={handleChange}
    />
  );
};

interface BrandColorTableProps {
  colors: Record<string, string>;
  colorPalette: Record<string, string>;
  options: ColorOption[];
  onChange: (colorName: string, color?: string) => void;
}

const BrandColorTable = ({
  colors,
  colorPalette,
  options,
  onChange,
}: BrandColorTableProps): JSX.Element => {
  return (
    <div>
      <Flex
        className={S.headerBorder}
        align="center"
        bg="background_page-secondary"
        c="text-secondary"
        fz="xs"
        fw="bold"
        lh="xs"
        lts="0.0625rem"
        tt="uppercase"
      >
        <Box flex="0 0 auto" w="12rem" px="xl" py="sm">{t`Color`}</Box>
        <Box px="xl" py="sm">{t`Where it's used`}</Box>
      </Flex>
      <Box className={S.bodyBorder}>
        {options.map((option) => (
          <BrandColorRow
            key={option.name}
            color={colors[option.name]}
            originalColor={color(option.name, colorPalette)}
            option={option}
            onChange={onChange}
          />
        ))}
      </Box>
    </div>
  );
};

interface BrandColorRowProps {
  color?: string;
  originalColor: string;
  option: ColorOption;
  onChange: (colorName: string, color?: string) => void;
}

const BrandColorRow = memo(function BrandColorRow({
  color,
  originalColor,
  option,
  onChange,
}: BrandColorRowProps) {
  const handleChange = useCallback(
    (color?: string) => {
      onChange(option.name, color);
    },
    [option, onChange],
  );

  return (
    <Flex className={S.rowDivider} align="center" c="text-secondary">
      <Box flex="0 0 auto" w="12rem" px="xl" py="lg">
        <ColorPicker
          value={color ?? originalColor}
          placeholder={Color(originalColor).hex()}
          onChange={handleChange}
        />
      </Box>
      <Box px="xl" py="lg">
        {option.description}
      </Box>
    </Flex>
  );
});
