import React, { memo, useCallback, useMemo } from "react";
import { t } from "ttag";
import { flatten, omit, set } from "lodash";
import { color } from "metabase/lib/colors";
import { useCurrentRef } from "metabase/hooks/use-current-ref";
import Button from "metabase/core/components/Button";
import ColorPicker from "metabase/core/components/ColorPicker";
import ModalWithTrigger from "metabase/components/ModalWithTrigger";
import {
  getAutoChartColors,
  getChartColorGroups,
  getDefaultChartColors,
} from "./utils";
import {
  TableBody,
  TableBodyCell,
  TableBodyRow,
  TableFooter,
  TableHeader,
  TableLink,
  TableTitle,
} from "./ChartColorSettings.styled";
import ChartColorModal from "metabase-enterprise/whitelabel/components/ChartColorModal";

export interface ChartColorSettingsProps {
  colors: Record<string, string>;
  colorPalette: Record<string, string>;
  onChange: (colors: Record<string, string>) => void;
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
        onChange(set({ ...colorsRef.current }, colorName, color));
      } else {
        onChange(omit({ ...colorsRef.current }, colorName));
      }
    },
    [colorsRef, onChange],
  );

  const handleReset = useCallback(() => {
    onChange(getDefaultChartColors(colorsRef.current, colorGroups));
  }, [colorsRef, colorGroups, onChange]);

  const handleGenerate = useCallback(() => {
    onChange(getAutoChartColors(colorsRef.current, colorGroups, colorPalette));
  }, [colorsRef, colorGroups, colorPalette, onChange]);

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

interface ChartColorTableProps {
  colors: Record<string, string>;
  colorPalette: Record<string, string>;
  colorGroups: string[][];
  onChange: (name: string, color?: string) => void;
  onReset: () => void;
  onGenerate: () => void;
}

interface ChartColorModalProps {
  onClose?: () => void;
}

const ChartColorTable = ({
  colors,
  colorPalette,
  colorGroups,
  onChange,
  onReset,
  onGenerate,
}: ChartColorTableProps): JSX.Element => {
  return (
    <div>
      <TableHeader>
        <TableTitle>{t`Chart colors`}</TableTitle>
        <ModalWithTrigger
          as={TableLink}
          triggerElement={t`Reset to default colors`}
        >
          {({ onClose }: ChartColorModalProps) => (
            <ChartColorModal onReset={onReset} onClose={onClose} />
          )}
        </ModalWithTrigger>
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
