import React, { useCallback, useMemo, useRef } from "react";
import { t } from "ttag";
import { assoc, dissoc } from "icepick";
import { getChartColorOptions } from "./utils";
import {
  TableBody,
  TableBodyRow,
  TableHeader,
  TableTitle,
} from "./ChartColorSettings.styled";

export interface ChartColorSettingsProps {
  colors: Record<string, string>;
  originalColors: Record<string, string>;
  onChange?: (colors: Record<string, string>) => void;
}

const ChartColorSettings = ({
  colors,
  originalColors,
  onChange,
}: ChartColorSettingsProps): JSX.Element => {
  const colorsRef = useRef(colors);
  colorsRef.current = colors;

  const options = useMemo(() => {
    return getChartColorOptions();
  }, []);

  const handleChange = useCallback(
    (name: string, color?: string) => {
      if (color) {
        onChange?.(assoc(colorsRef.current, name, color));
      } else {
        onChange?.(dissoc(colorsRef.current, name));
      }
    },
    [onChange],
  );

  return (
    <ChartColorTable
      colors={colors}
      originalColors={originalColors}
      options={options}
      onChange={handleChange}
    />
  );
};

interface ChartColorTable {
  colors: Record<string, string>;
  originalColors: Record<string, string>;
  options: string[][];
  onChange: (name: string, color?: string) => void;
}

const ChartColorTable = ({
  colors,
  originalColors,
  options,
  onChange,
}: ChartColorTable): JSX.Element => {
  return (
    <div>
      <TableHeader>
        <TableTitle>{t`Chart colors`}</TableTitle>
      </TableHeader>
      <TableBody>
        {options.map((option, index) => (
          <TableBodyRow key={index}>
            {option.map(name => (
              <ChartColorCell
                key={name}
                name={name}
                color={colors[name]}
                originalColor={originalColors[name]}
                onChange={onChange}
              />
            ))}
          </TableBodyRow>
        ))}
      </TableBody>
    </div>
  );
};

interface ChartColorCellProps {
  name: string;
  color?: string;
  originalColor: string;
  onChange: (name: string, color?: string) => void;
}

const ChartColorCell = (props: ChartColorCellProps): JSX.Element => {
  return <div />;
};

export default ChartColorSettings;
