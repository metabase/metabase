import { useState } from "react";
import { t } from "ttag";

import { useDefaultEmbeddingThemeSettings } from "metabase/admin/embedding/hooks/use-default-embedding-theme-settings";
import type {
  MetabaseColors,
  MetabaseTheme,
} from "metabase/embedding-sdk/theme";
import { Box, Flex, Icon, Tooltip } from "metabase/ui";
import type { EmbeddingTheme } from "metabase-types/api/embedding-theme";

import { stripDefaultThemeSettings } from "../../utils/strip-default-theme-settings";

import { ColorCustomizationSection } from "./ColorCustomizationSection";
import { ThemeCard, getThemeColors } from "./ThemeCard";

type ThemeSelection =
  | { type: "default" }
  | { type: "saved"; themeId: number }
  | { type: "custom" };

interface ThemeSelectorSectionProps {
  savedThemes: EmbeddingTheme[];
  theme: MetabaseTheme | undefined;
  onThemeChange: (theme: MetabaseTheme | undefined) => void;
  onColorChange: (colors: Partial<MetabaseColors>) => void;
  onColorReset: () => void;
}

export const ThemeSelectorSection = ({
  savedThemes,
  theme,
  onThemeChange,
  onColorChange,
  onColorReset,
}: ThemeSelectorSectionProps) => {
  const defaultThemeSettings = useDefaultEmbeddingThemeSettings();
  const [selection, setSelection] = useState<ThemeSelection>({
    type: "default",
  });

  const isCustomSelected = selection.type === "custom";

  const handleDefaultClick = () => {
    setSelection({ type: "default" });
    onThemeChange(undefined);
  };

  const handleThemeCardClick = (themeId: number) => {
    const savedTheme = savedThemes.find((t) => t.id === themeId);
    if (!savedTheme) {
      return;
    }

    setSelection({ type: "saved", themeId });
    const nonDefaultSettings = stripDefaultThemeSettings(
      savedTheme.settings,
      defaultThemeSettings,
    );
    onThemeChange(nonDefaultSettings);
  };

  const handleCustomClick = () => {
    setSelection({ type: "custom" });
    onThemeChange(undefined);
  };

  const hasThemes = savedThemes.length > 0;
  const showColorInputs = !hasThemes || isCustomSelected;
  const hasColorChanged = !!theme?.colors;

  const handleResetColors = (e: React.MouseEvent) => {
    e.stopPropagation();
    onColorReset();
  };

  const customCardIcon = hasColorChanged ? (
    <Tooltip label={t`Reset colors`}>
      <Icon
        name="revert"
        size={12}
        c="brand"
        onClick={handleResetColors}
        aria-label={t`Reset colors`}
        style={{ cursor: "pointer" }}
      />
    </Tooltip>
  ) : (
    <Icon name="pencil" size={12} c="text-secondary" />
  );

  return (
    <Flex direction="column" gap={0} w="100%">
      {hasThemes && (
        <Box
          style={{
            display: "grid",
            gap: "var(--mantine-spacing-sm)",
            gridTemplateColumns: "1fr 1fr",
          }}
        >
          <ThemeCard
            name={t`Default Theme`}
            colors={[]}
            isSelected={selection.type === "default"}
            onClick={handleDefaultClick}
          />
          {savedThemes.map((savedTheme) => (
            <ThemeCard
              key={savedTheme.id}
              name={savedTheme.name}
              colors={getThemeColors(savedTheme.settings.colors)}
              fontFamily={savedTheme.settings.fontFamily}
              isSelected={
                selection?.type === "saved" &&
                selection.themeId === savedTheme.id
              }
              onClick={() => handleThemeCardClick(savedTheme.id)}
            />
          ))}
          <ThemeCard
            name={t`Custom`}
            colors={[]}
            icon={customCardIcon}
            isSelected={isCustomSelected}
            onClick={handleCustomClick}
          />
        </Box>
      )}

      {isCustomSelected && <Box h={24} />}

      {showColorInputs && (
        <ColorCustomizationSection
          theme={theme}
          onColorChange={onColorChange}
        />
      )}
    </Flex>
  );
};
