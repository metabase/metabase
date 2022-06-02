import React, { memo, useCallback, useMemo } from "react";
import { t } from "ttag";
import { flatten, omit, set } from "lodash";
import { color } from "metabase/lib/colors";
import { useCurrentRef } from "metabase/hooks/use-current-ref";
import Button from "metabase/core/components/Button";
import ColorPicker from "metabase/core/components/ColorPicker";
import { getAutoChartColors, getChartColorGroups } from "./utils";
import {
  TableBody,
  TableBodyCell,
  TableBodyRow,
  TableFooter,
  TableHeader,
  TableLink,
  TableTitle,
} from "./ChartColorSettings.styled";
import groups from "metabase/entities/groups";

export interface ChartColorSettingsProps {
  colors: Record<string, string>;
  colorPalette: Record<string, string>;
  onChange?: (colors: Record<string, string>) => void;
}

const ChartColorSettings = ({
  colors,
  colorPalette,
  onChange,
}: ChartColorSettingsProps): JSX.Element => {
  const colorsRef = useCurrentRef(colors);
  const colorGroups = useMemo(getChartColorGroups, []);

  const handleChange = useCallback(
    (colorName: string, color?: string) => {
      if (color) {
        onChange?.(set({ ...colorsRef.current }, colorName, color));
      } else {
        onChange?.(omit({ ...colorsRef.current }, colorName));
      }
    },
    [colorsRef, onChange],
  );

  const handleReset = useCallback(() => {
    onChange?.(omit({ ...colorsRef.current }, flatten(colorGroups)));
  }, [colorsRef, colorGroups, onChange]);

  const handleGenerate = useCallback(() => {
    onChange?.(getAutoChartColors(colorGroups, colors, colorPalette));
  }, [colorGroups, colors, colorPalette, onChange]);

  return (
    <ChartColorTable
      colors={colors}
      colorPalette={colorPalette}
      colorGroups={colorGroups}
      onChange={handleChange}
      onReset={handleReset}
      onGenerate={handleGenerate}
    />
  );
};

interface ChartColorTable {
  colors: Record<string, string>;
  colorPalette: Record<string, string>;
  colorGroups: string[][];
  onChange: (name: string, color?: string) => void;
  onReset: () => void;
  onGenerate: () => void;
}

const ChartColorTable = ({
  colors,
  colorPalette,
  colorGroups,
  onChange,
  onReset,
  onGenerate,
}: ChartColorTable): JSX.Element => {
  return (
    <div>
      <TableHeader>
        <TableTitle>{t`Chart colors`}</TableTitle>
        <TableLink onClick={onReset}>{t`Reset to default colors`}</TableLink>
      </TableHeader>
      <TableBody>
        {colorGroups.map((colorGroup, index) => (
          <TableBodyRow key={index}>
            {colorGroup.map(colorName => (
              <ChartColorCell
                key={colorName}
                color={colors[colorName]}
                originalColor={color(colorName, colorPalette)}
                colorName={colorName}
                onChange={onChange}
              />
            ))}
          </TableBodyRow>
        ))}
      </TableBody>
      <TableFooter>
        <Button primary onClick={onGenerate}>{t`Generate chart colors`}</Button>
      </TableFooter>
    </div>
  );
};

interface ChartColorCellProps {
  color?: string;
  originalColor: string;
  colorName: string;
  onChange: (colorName: string, color?: string) => void;
}

const ChartColorCell = memo(function ChartColorCell({
  color,
  originalColor,
  colorName,
  onChange,
}: ChartColorCellProps) {
  const handleChange = useCallback(
    (color?: string) => {
      onChange(colorName, color);
    },
    [colorName, onChange],
  );

  return (
    <TableBodyCell>
      <ColorPicker
        value={color ?? originalColor}
        placeholder={t`Auto`}
        isAuto={color == null}
        onChange={handleChange}
      />
    </TableBodyCell>
  );
});

export default ChartColorSettings;
