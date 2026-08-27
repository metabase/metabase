import { useCallback } from "react";
import { P, match } from "ts-pattern";
import { t } from "ttag";

import { useListEmbeddingThemesQuery } from "metabase/api/embedding-theme";
import type {
  MetabaseColors,
  MetabaseThemePreset,
} from "metabase/embedding-sdk/theme";
import { Card, Checkbox, Divider, Icon, Tooltip } from "metabase/ui";

import { useSdkIframeEmbedSetupContext } from "../../../context";
import { BaseAppearanceSection } from "../../Appearance/BaseAppearanceSection";
import { SimpleThemeSwitcherSection } from "../../Appearance/SimpleThemeSwitcherSection";
import { ThemeSelectorSection } from "../../Appearance/ThemeSelectorSection";
import { MetabotLayoutSetting } from "../../MetabotLayoutSetting";

export const AppearanceCard = () => {
  const { isSimpleEmbedFeatureAvailable, settings, updateSettings } =
    useSdkIframeEmbedSetupContext();

  const { theme } = settings;

  const { data: savedThemes } = useListEmbeddingThemesQuery(undefined, {
    skip: !isSimpleEmbedFeatureAvailable,
  });

  const updateThemeId = useCallback(
    (themeId: number | undefined) => {
      updateSettings({
        theme: themeId ? { id: themeId } : undefined,
      } satisfies Partial<typeof settings>);
    },
    [updateSettings],
  );

  const initializeCustomTheme = useCallback(
    (initialColors: Partial<MetabaseColors> | undefined) => {
      updateSettings({
        theme: initialColors ? { colors: initialColors } : undefined,
      } satisfies Partial<typeof settings>);
    },
    [updateSettings],
  );

  const updateThemePreset = useCallback(
    (preset: MetabaseThemePreset) => {
      updateSettings({ theme: { preset } } satisfies Partial<typeof settings>);
    },
    [updateSettings],
  );

  const updateColors = useCallback(
    (nextColors: Partial<MetabaseColors>) => {
      updateSettings({
        theme: { ...theme, colors: { ...theme?.colors, ...nextColors } },
      } satisfies Partial<typeof settings>);
    },
    [theme, updateSettings],
  );

  const resetTheme = useCallback(
    () =>
      updateSettings({ theme: undefined } satisfies Partial<typeof settings>),
    [updateSettings],
  );

  const hasSavedThemes = (savedThemes?.length ?? 0) > 0;
  const showHeaderReset =
    isSimpleEmbedFeatureAvailable && !hasSavedThemes && !!theme?.colors;

  const appearanceSection = match(settings)
    .with({ template: "exploration" }, () => null)
    .with({ componentName: "metabase-metabot" }, () => <MetabotLayoutSetting />)
    .with(
      { componentName: P.union("metabase-question", "metabase-dashboard") },
      (settings) => {
        const label = match(settings.componentName)
          .with("metabase-dashboard", () => t`Show dashboard title`)
          .with("metabase-question", () => t`Show chart title`)
          .exhaustive();

        return (
          <Checkbox
            label={label}
            checked={settings.withTitle}
            onChange={(e) =>
              updateSettings({
                withTitle: e.target.checked,
              } satisfies Partial<typeof settings>)
            }
          />
        );
      },
    )
    .otherwise(() => null);

  return (
    <Card p="md">
      <BaseAppearanceSection
        icons={
          showHeaderReset ? (
            <Tooltip label={t`Reset colors`}>
              <Icon
                name="revert"
                size={16}
                c="core-brand"
                onClick={resetTheme}
                aria-label={t`Reset colors`}
                style={{ cursor: "pointer" }}
              />
            </Tooltip>
          ) : null
        }
      >
        {isSimpleEmbedFeatureAvailable ? (
          <ThemeSelectorSection
            savedThemes={savedThemes ?? []}
            theme={theme}
            onThemeChange={updateThemeId}
            onCustomSelect={initializeCustomTheme}
            onColorChange={updateColors}
            onColorReset={resetTheme}
          />
        ) : (
          <SimpleThemeSwitcherSection
            preset={theme?.preset}
            onPresetChange={updateThemePreset}
          />
        )}
      </BaseAppearanceSection>
      {appearanceSection && <Divider mt="lg" mb="md" />}
      {appearanceSection}
    </Card>
  );
};
