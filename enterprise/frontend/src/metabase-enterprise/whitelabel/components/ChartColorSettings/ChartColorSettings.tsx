import { useDisclosure } from "@mantine/hooks";
import { memo, useCallback, useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import { ColorPicker } from "metabase/common/components/ColorPicker";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { useCurrentRef } from "metabase/common/hooks/use-current-ref";
import { color } from "metabase/lib/colors";
import { Button, Group } from "metabase/ui";

import {
  TableBody,
  TableBodyCell,
  TableBodyRow,
  TableFooter,
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

const ChartColorTable = ({
  colors,
  colorPalette,
  colorGroups,
  hasCustomColors,
  onChange,
  onReset,
  onGenerate,
}: ChartColorTableProps): JSX.Element => {
  const [showResetModal, { open: openResetModal, close: closeResetModal }] =
    useDisclosure(false);
  const handleReset = () => {
    closeResetModal();
    onReset();
  };

  return (
    <div>
      <TableBody>
        {colorGroups.map((colorGroup, index) => (
          <TableBodyRow key={index}>
            {colorGroup.map((colorName) => (
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
        <Group gap="sm">
          <Button onClick={onGenerate}>{t`Generate chart colors`}</Button>
          {hasCustomColors && (
            <Button variant="subtle" onClick={openResetModal}>
              {t`Reset to default colors`}
            </Button>
          )}
        </Group>
        {hasCustomColors && (
          <ConfirmModal
            opened={showResetModal}
            title={t`Are you sure you want to reset to default colors?`}
            onClose={closeResetModal}
            onConfirm={handleReset}
            confirmButtonText={t`Reset`}
          />
        )}
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
