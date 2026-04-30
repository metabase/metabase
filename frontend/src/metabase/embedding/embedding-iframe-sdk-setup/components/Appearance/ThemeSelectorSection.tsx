import { useState } from "react";
import { t } from "ttag";

import type { MetabaseColors } from "metabase/embedding-sdk/theme";
import { Box, Flex, Icon, SimpleGrid, Tooltip } from "metabase/ui";
import type { EmbeddingTheme } from "metabase-types/api/embedding-theme";

import type { SdkIframeEmbedSetupTheme } from "../../types";
import { getConfigurableThemeColors } from "../../utils/theme-colors";

import { ColorCustomizationSection } from "./ColorCustomizationSection";
import { ThemeCard, getThemeColors } from "./ThemeCard";

const pickConfigurableColors = (
  colors: Partial<MetabaseColors> | undefined,
): Partial<MetabaseColors> | undefined => {
  if (!colors) {
    return undefined;
  }

  const picked: Partial<MetabaseColors> = {};
  for (const { key } of getConfigurableThemeColors()) {
    if (colors[key] !== undefined) {
      picked[key] = colors[key];
    }
  }

  return Object.keys(picked).length > 0 ? picked : undefined;
};

type ThemeSelection =
  | { type: "default" }
  | { type: "saved"; themeId: number }
  | { type: "custom" };

interface ThemeSelectorSectionProps {
  savedThemes: EmbeddingTheme[];
  theme: SdkIframeEmbedSetupTheme | undefined;
  onThemeChange: (themeId: number | undefined) => void;
  onCustomSelect: (initialColors: Partial<MetabaseColors> | undefined) => void;
  onColorChange: (colors: Partial<MetabaseColors>) => void;
  onColorReset: () => void;
}

export const ThemeSelectorSection = ({
  savedThemes,
  theme,
  onThemeChange,
  onCustomSelect,
  onColorChange,
  onColorReset,
}: ThemeSelectorSectionProps) => {
  const [selection, setSelection] = useState<ThemeSelection>(() => {
    const themeId = theme?.id;
    const isKnown =
      themeId !== undefined && savedThemes.some((t) => t.id === themeId);
    if (isKnown) {
      return { type: "saved", themeId };
    }
    if (theme?.colors) {
      return { type: "custom" };
    }
    return { type: "default" };
  });

  const isCustomSelected = selection.type === "custom";

  const handleDefaultClick = () => {
    setSelection({ type: "default" });
    onThemeChange(undefined);
  };

  const handleThemeCardClick = (themeId: number) => {
    if (!savedThemes.some((t) => t.id === themeId)) {
      return;
    }

    setSelection({ type: "saved", themeId });
    onThemeChange(themeId);
  };

  const handleCustomClick = () => {
    const previouslySelectedSavedTheme =
      selection.type === "saved"
        ? savedThemes.find((t) => t.id === selection.themeId)
        : undefined;

    setSelection({ type: "custom" });
    onCustomSelect(
      pickConfigurableColors(previouslySelectedSavedTheme?.settings.colors),
    );
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
        <SimpleGrid cols={2} spacing="sm">
          <ThemeCard
            name={t`Instance theme`}
            colors={[]}
            icon={
              <Tooltip
                label={t`Changing the appearance settings will also update this embed.`}
              >
                <Icon
                  name="info"
                  size={12}
                  c="text-secondary"
                  aria-label={t`Instance theme info`}
                />
              </Tooltip>
            }
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
        </SimpleGrid>
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
