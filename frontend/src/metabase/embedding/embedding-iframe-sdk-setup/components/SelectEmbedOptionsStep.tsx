import { useCallback, useMemo } from "react";
import { Link } from "react-router";
import { P, match } from "ts-pattern";
import { c, t } from "ttag";

import { useHasEmailSetup } from "metabase/common/hooks";
import type {
  MetabaseColors,
  MetabaseThemePreset,
} from "metabase/embedding-sdk/theme";
import {
  Card,
  Checkbox,
  Divider,
  Flex,
  HoverCard,
  Icon,
  Stack,
  Text,
} from "metabase/ui";

import { UPSELL_CAMPAIGN_BEHAVIOR } from "../analytics";
import { useSdkIframeEmbedSetupContext } from "../context";

import { ColorCustomizationSection } from "./Appearance/ColorCustomizationSection";
import { SimpleThemeSwitcherSection } from "./Appearance/SimpleThemeSwitcherSection";
import { EmbeddingUpsell } from "./Common/EmbeddingUpsell";
import { WithNotAvailableForOssOrGuestEmbedsGuard } from "./Common/WithNotAvailableForOssOrGuestEmbedsGuard";
import { LegacyStaticEmbeddingAlert } from "./LegacyStaticEmbeddingAlert";
import { MetabotLayoutSetting } from "./MetabotLayoutSetting";
import { ParameterSettings } from "./ParameterSettings";

export const SelectEmbedOptionsStep = () => (
  <Stack gap="md">
    <BehaviorSection />
    <ParametersSection />
    <AppearanceSection />
    <LegacyStaticEmbeddingAlert />
    <EmbeddingUpsell campaign={UPSELL_CAMPAIGN_BEHAVIOR} />
  </Stack>
);

const BehaviorSection = () => {
  const { isSimpleEmbedFeatureAvailable, settings, updateSettings } =
    useSdkIframeEmbedSetupContext();
  const hasEmailSetup = useHasEmailSetup();

  const behaviorSection = useMemo(() => {
    return match(settings)
      .with(
        { template: "exploration", isGuest: P.optional(false) },
        (settings) => (
          <Checkbox
            label={t`Allow people to save new questions`}
            disabled={settings.isGuest}
            checked={settings.isSaveEnabled}
            onChange={(e) =>
              updateSettings({
                isSaveEnabled: e.target.checked,
              } satisfies Partial<typeof settings>)
            }
          />
        ),
      )
      .with(
        { componentName: "metabase-question", questionId: P.nonNullable },
        (settings) => (
          <Stack gap="md">
            <WithNotAvailableForOssOrGuestEmbedsGuard>
              {({ disabled }) => (
                <Checkbox
                  label={t`Allow people to drill through on data points`}
                  disabled={disabled}
                  checked={settings.drills}
                  onChange={(e) =>
                    updateSettings({
                      drills: e.target.checked,
                    } satisfies Partial<typeof settings>)
                  }
                />
              )}
            </WithNotAvailableForOssOrGuestEmbedsGuard>

            <Checkbox
              label={t`Allow downloads`}
              disabled={!isSimpleEmbedFeatureAvailable}
              checked={settings.withDownloads}
              onChange={(e) =>
                updateSettings({
                  withDownloads: e.target.checked,
                } satisfies Partial<typeof settings>)
              }
            />

            <WithNotAvailableForOssOrGuestEmbedsGuard>
              {({ disabled }) => (
                <Checkbox
                  label={t`Allow people to save new questions`}
                  disabled={disabled}
                  checked={settings.isSaveEnabled}
                  onChange={(e) =>
                    updateSettings({
                      isSaveEnabled: e.target.checked,
                    } satisfies Partial<typeof settings>)
                  }
                />
              )}
            </WithNotAvailableForOssOrGuestEmbedsGuard>

            <WithNotAvailableForOssOrGuestEmbedsGuard>
              {({ disabled: disabledInGuestEmbedding }) => {
                return (
                  <Flex align="center" gap="xs">
                    <Checkbox
                      disabled={!hasEmailSetup || disabledInGuestEmbedding}
                      label={t`Allow alerts`}
                      checked={settings.withAlerts}
                      onChange={(e) =>
                        updateSettings({
                          withAlerts: e.target.checked,
                        } satisfies Partial<typeof settings>)
                      }
                    />
                    {!hasEmailSetup && !disabledInGuestEmbedding && (
                      <HoverCard>
                        <HoverCard.Target>
                          <Icon name="info" size={14} c="text-secondary" />
                        </HoverCard.Target>
                        <HoverCard.Dropdown p="sm">
                          <Text>{c(
                            "{0} is a link to email settings page with text 'admin settings'",
                          ).jt`To allow alerts, set up email in ${(
                            <Link
                              key="admin-settings-link"
                              to="/admin/settings/email"
                            >
                              <Text
                                display="inline"
                                c="text-brand"
                                fw="bold"
                              >{c(
                                "is a link in a sentence 'To allow alerts, set up email in admin settings'",
                              ).t`admin settings`}</Text>
                            </Link>
                          )}`}</Text>
                        </HoverCard.Dropdown>
                      </HoverCard>
                    )}
                  </Flex>
                );
              }}
            </WithNotAvailableForOssOrGuestEmbedsGuard>
          </Stack>
        ),
      )
      .with(
        { componentName: "metabase-dashboard", dashboardId: P.nonNullable },
        (settings) => (
          <Stack gap="md">
            <WithNotAvailableForOssOrGuestEmbedsGuard>
              {({ disabled }) => (
                <Checkbox
                  label={t`Allow people to drill through on data points`}
                  disabled={disabled}
                  checked={settings.drills}
                  onChange={(e) =>
                    updateSettings({
                      drills: e.target.checked,
                    } satisfies Partial<typeof settings>)
                  }
                />
              )}
            </WithNotAvailableForOssOrGuestEmbedsGuard>

            <Checkbox
              label={t`Allow downloads`}
              disabled={!isSimpleEmbedFeatureAvailable}
              checked={settings.withDownloads}
              onChange={(e) =>
                updateSettings({
                  withDownloads: e.target.checked,
                } satisfies Partial<typeof settings>)
              }
            />

            <WithNotAvailableForOssOrGuestEmbedsGuard>
              {({ disabled: disabledInGuestEmbedding }) => {
                return (
                  <Flex align="center" gap="xs">
                    <Checkbox
                      disabled={!hasEmailSetup || disabledInGuestEmbedding}
                      label={t`Allow subscriptions`}
                      checked={settings.withSubscriptions}
                      onChange={(e) =>
                        updateSettings({
                          withSubscriptions: e.target.checked,
                        } satisfies Partial<typeof settings>)
                      }
                    />
                    {!hasEmailSetup && !disabledInGuestEmbedding && (
                      <HoverCard>
                        <HoverCard.Target>
                          <Icon name="info" size={14} c="text-secondary" />
                        </HoverCard.Target>
                        <HoverCard.Dropdown p="sm">
                          <Text>{c(
                            "{0} is a link to email settings page with text 'admin settings'",
                          ).jt`To allow subscriptions, set up email in ${(
                            <Link
                              key="admin-settings-link"
                              to="/admin/settings/email"
                            >
                              <Text
                                display="inline"
                                c="text-brand"
                                fw="bold"
                              >{c(
                                "is a link in a sentence 'To allow subscriptions, set up email in admin settings'",
                              ).t`admin settings`}</Text>
                            </Link>
                          )}`}</Text>
                        </HoverCard.Dropdown>
                      </HoverCard>
                    )}
                  </Flex>
                );
              }}
            </WithNotAvailableForOssOrGuestEmbedsGuard>
          </Stack>
        ),
      )
      .with(
        { componentName: "metabase-browser", isGuest: P.optional(false) },
        (settings) => (
          <Checkbox
            label={t`Allow editing dashboards and questions`}
            disabled={settings.isGuest}
            checked={!settings.readOnly}
            onChange={(e) =>
              updateSettings({
                readOnly: !e.target.checked,
              } satisfies Partial<typeof settings>)
            }
          />
        ),
      )
      .otherwise(() => null);
  }, [hasEmailSetup, isSimpleEmbedFeatureAvailable, settings, updateSettings]);

  if (behaviorSection === null) {
    return null;
  }

  return (
    <Card p="md">
      <Text size="lg" fw="bold" mb="md">
        {t`Behavior`}
      </Text>

      {behaviorSection}
    </Card>
  );
};

const ParametersSection = () => {
  const { experience } = useSdkIframeEmbedSetupContext();

  if (experience !== "dashboard" && experience !== "chart") {
    return null;
  }

  return (
    <Card p="md">
      <Text size="lg" fw="bold" mb="xs">
        {t`Parameters`}
      </Text>

      <Text size="sm" c="text-secondary" mb="lg">
        {experience === "dashboard"
          ? t`Set default values and control visibility`
          : t`Set default values`}
      </Text>

      <ParameterSettings />
    </Card>
  );
};

const AppearanceSection = () => {
  const { isSimpleEmbedFeatureAvailable, settings, updateSettings } =
    useSdkIframeEmbedSetupContext();

  const { theme } = settings;

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
      {isSimpleEmbedFeatureAvailable ? (
        <ColorCustomizationSection
          theme={theme}
          onColorChange={updateColors}
          onColorReset={() =>
            updateSettings({ theme: undefined } satisfies Partial<
              typeof settings
            >)
          }
        />
      ) : (
        <SimpleThemeSwitcherSection
          preset={theme?.preset}
          onPresetChange={updateThemePreset}
        />
      )}

      {appearanceSection && <Divider mt="lg" mb="md" />}
      {appearanceSection}
    </Card>
  );
};
