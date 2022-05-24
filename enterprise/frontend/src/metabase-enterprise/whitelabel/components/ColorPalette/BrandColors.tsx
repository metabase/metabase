import React, { useCallback, useMemo, useRef } from "react";
import { t } from "ttag";
import ColorPicker from "metabase/core/components/ColorPicker";
import { getBrandColorOptions } from "./utils";
import { ColorOption } from "./types";
import {
  TableBody,
  TableBodyCell,
  TableBodyRow,
  TableHeader,
  TableHeaderCell,
  TableHeaderRow,
  TableRoot,
} from "./BrandColors.styled";

export interface BrandColorsProps {
  colors: Record<string, string>;
  onChange: (colors: Record<string, string>) => void;
}

const BrandColors = ({ colors, onChange }: BrandColorsProps): JSX.Element => {
  const colorsRef = useRef(colors);
  colorsRef.current = colors;

  const options = useMemo(() => {
    return getBrandColorOptions();
  }, []);

  const handleChange = useCallback(
    (color: string, option: ColorOption) => {
      onChange({ ...colorsRef.current, [option.name]: color });
    },
    [onChange],
  );

  return (
    <BrandColorTable
      colors={colors}
      options={options}
      onChange={handleChange}
    />
  );
};

interface BrandColorTableProps {
  colors: Record<string, string>;
  options: ColorOption[];
  onChange: (value: string, color: ColorOption) => void;
}

const BrandColorTable = ({
  colors,
  options,
  onChange,
}: BrandColorTableProps): JSX.Element => {
  return (
    <TableRoot>
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
            option={option}
            onChange={onChange}
          />
        ))}
      </TableBody>
    </TableRoot>
  );
};

interface BrandColorRowProps {
  color: string;
  option: ColorOption;
  onChange: (color: string, option: ColorOption) => void;
}

const BrandColorRow = ({
  color,
  option,
  onChange,
}: BrandColorRowProps): JSX.Element => {
  const handleChange = useCallback(
    (color: string) => {
      onChange(color, option);
    },
    [option, onChange],
  );

  return (
    <TableBodyRow>
      <TableBodyCell>
        <ColorPicker color={color} onChange={handleChange} />
      </TableBodyCell>
      <TableBodyCell>{option.description}</TableBodyCell>
    </TableBodyRow>
  );
};

export default BrandColors;
