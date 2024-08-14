import { memo, useCallback, useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import ColorPicker from "metabase/core/components/ColorPicker";
import { useCurrentRef } from "metabase/hooks/use-current-ref";
import { color } from "metabase/lib/colors";

import {
  TableBody,
  TableBodyCell,
  TableBodyRow,
  TableHeader,
  TableHeaderCell,
  TableHeaderRow,
} from "./BrandColorSettings.styled";
import type { ColorOption } from "./types";
import { getBrandColorOptions } from "./utils";

export interface BrandColorSettingsProps {
  colors: Record<string, string>;
  colorPalette: Record<string, string>;
  onChange: (colors: Record<string, string>) => void;
}

const BrandColorSettings = ({
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
      <TableHeader>
        <TableHeaderRow>
          <TableHeaderCell>{t`Color`}</TableHeaderCell>
          <TableHeaderCell>{t`Where it's used`}</TableHeaderCell>
        </TableHeaderRow>
      </TableHeader>
      <TableBody>
        {options.map(option => (
          <BrandColorRow
            key={option.name}
            color={colors[option.name]}
            originalColor={color(option.name, colorPalette)}
            option={option}
            onChange={onChange}
          />
        ))}
      </TableBody>
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
    <TableBodyRow>
      <TableBodyCell>
        <ColorPicker
          value={color ?? originalColor}
          placeholder={originalColor}
          onChange={handleChange}
        />
      </TableBodyCell>
      <TableBodyCell>{option.description}</TableBodyCell>
    </TableBodyRow>
  );
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default BrandColorSettings;
