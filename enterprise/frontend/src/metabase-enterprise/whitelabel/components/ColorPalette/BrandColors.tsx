import React, { useCallback, useMemo } from "react";
import { t } from "ttag";
import { getBrandColors } from "./utils";
import { ColorInfo } from "./types";
import {
  TableBody,
  TableBodyCell,
  TableBodyRow,
  TableHeader,
  TableHeaderCell,
  TableHeaderRow,
  TableRoot,
} from "./BrandColorTable.styled";

export interface BrandColorsProps {
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
}

const BrandColors = ({ values, onChange }: BrandColorsProps): JSX.Element => {
  const colors = useMemo(() => {
    return getBrandColors();
  }, []);

  const handleChange = useCallback(
    (color: ColorInfo, value: string) => {
      onChange({ ...values, [color.name]: value });
    },
    [values, onChange],
  );

  return (
    <BrandColorTable colors={colors} values={values} onChange={handleChange} />
  );
};

interface BrandColorTableProps {
  colors: ColorInfo[];
  values: Record<string, string>;
  onChange: (color: ColorInfo, value: string) => void;
}

const BrandColorTable = ({
  colors,
  values,
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
        {colors.map((color, index) => (
          <BrandColorRow
            key={color.name}
            color={color}
            value={values[color.name]}
            onChange={onChange}
          />
        ))}
      </TableBody>
    </TableRoot>
  );
};

interface BrandColorRowProps {
  color: ColorInfo;
  value: string;
  onChange: (color: ColorInfo, value: string) => void;
}

const BrandColorRow = ({ color, value }: BrandColorRowProps): JSX.Element => {
  return (
    <TableBodyRow>
      <TableBodyCell>{color.name}</TableBodyCell>
      <TableBodyCell>{color.description}</TableBodyCell>
    </TableBodyRow>
  );
};

export default BrandColors;
