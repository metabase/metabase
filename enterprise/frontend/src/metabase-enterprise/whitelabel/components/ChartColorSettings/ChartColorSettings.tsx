import { useDisclosure } from "@mantine/hooks";
import { memo, useCallback, useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import { ColorPicker } from "metabase/common/components/ColorPicker";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { useCurrentRef } from "metabase/common/hooks/use-current-ref";
import { Box, Button, Flex, Group } from "metabase/ui";
import { color } from "metabase/ui/colors";
import type { ColorPalette } from "metabase/ui/colors/types";
import type { ColorSettings, ColorSettingsAccentKey } from "metabase-types/api";

import S from "./ChartColorSettings.module.css";
import {
  getAutoChartColors,
  getChartColorGroups,
  getDefaultChartColors,
  hasCustomChartColors,
} from "./utils";

export interface ChartColorSettingsProps {
  colors: ColorSettings;
  colorPalette: ColorPalette;
  onChange: (colors: ColorSettings) => void;
}

export const ChartColorSettings = ({
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
    (colorName: ColorSettingsAccentKey, color?: string) => {
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
  colors: ColorSettings;
  colorPalette: ColorPalette;
  colorGroups: ColorSettingsAccentKey[][];
  hasCustomColors: boolean;
  onChange: (name: ColorSettingsAccentKey, color?: string) => void;
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
      <Box className={S.bodyBorder}>
        {colorGroups.map((colorGroup, index) => (
          <Flex key={index} className={S.rowDivider}>
            {colorGroup.map((colorName) => (
              <ChartColorCell
                key={colorName}
                color={colors[colorName]}
                originalColor={color(colorName, colorPalette)}
                colorName={colorName}
                onChange={onChange}
              />
            ))}
          </Flex>
        ))}
      </Box>
      <Box className={S.footerBorder} px="xl" py="lg">
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
      </Box>
    </div>
  );
};

interface ChartColorCellProps {
  color?: string;
  originalColor: string;
  colorName: ColorSettingsAccentKey;
  onChange: (colorName: ColorSettingsAccentKey, color?: string) => void;
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
    <Box className={S.colorCell} flex="1 1 auto" px="xl" py="lg">
      <ColorPicker
        value={color ?? originalColor}
        placeholder={t`Auto`}
        isAuto={color == null}
        onChange={handleChange}
      />
    </Box>
  );
});
