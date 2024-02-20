import { memo, useCallback, useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import ModalWithTrigger from "metabase/components/ModalWithTrigger";
import ColorPicker from "metabase/core/components/ColorPicker";
import { useCurrentRef } from "metabase/hooks/use-current-ref";
import { color } from "metabase/lib/colors";
import { Button } from "metabase/ui";
import ColorResetModal from "metabase-enterprise/whitelabel/components/ColorResetModal";

import {
  TableBody,
  TableBodyCell,
  TableBodyRow,
  TableFooter,
  TableHeader,
  TableLink,
  TableTitle,
} from "./ChartColorSettings.styled";
import {
  getAutoChartColors,
  getChartColorGroups,
  getDefaultChartColors,
  hasCustomChartColors,
} from "./utils";

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

  const hasCustomColors = useMemo(() => {
    return hasCustomChartColors(colors, colorGroups);
  }, [colors, colorGroups]);

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
      hasCustomColors={hasCustomColors}
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
  hasCustomColors: boolean;
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
  hasCustomColors,
  onChange,
  onReset,
  onGenerate,
}: ChartColorTableProps): JSX.Element => {
  return (
    <div>
      <TableHeader>
        <TableTitle>{t`Chart colors`}</TableTitle>
        {hasCustomColors && (
          <ModalWithTrigger
            as={TableLink}
            triggerElement={t`Reset to default colors`}
          >
            {({ onClose }: ChartColorModalProps) => (
              <ColorResetModal onReset={onReset} onClose={onClose} />
            )}
          </ModalWithTrigger>
        )}
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
        <Button onClick={onGenerate}>{t`Generate chart colors`}</Button>
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ChartColorSettings;
