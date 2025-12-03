import { type ReactNode, useCallback, useMemo } from "react";
import { P, match } from "ts-pattern";
import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import {
  UPSELL_CAMPAIGN_AUTH,
  UPSELL_CAMPAIGN_BEHAVIOR,
} from "metabase/embedding/embedding-iframe-sdk-setup/analytics";
import { getAuthTypeForSettings } from "metabase/embedding/embedding-iframe-sdk-setup/utils/get-auth-type-for-settings";
import { isQuestionOrDashboardSettings } from "metabase/embedding/embedding-iframe-sdk-setup/utils/is-question-or-dashboard-settings";
import type { MetabaseColors } from "metabase/embedding-sdk/theme";
import {
  Card,
  Checkbox,
  Divider,
  Flex,
  HoverCard,
  Icon,
  Radio,
  Stack,
  Text,
} from "metabase/ui";

import { useSdkIframeEmbedSetupContext } from "../context";

import { ColorCustomizationSection } from "./ColorCustomizationSection";
import { LegacyStaticEmbeddingAlert } from "./LegacyStaticEmbeddingAlert";
import { MetabotLayoutSetting } from "./MetabotLayoutSetting";
import { ParameterSettings } from "./ParameterSettings";
import {
  TooltipWarning,
  type TooltipWarningMode,
} from "./warnings/TooltipWarning";
import { WithSimpleEmbeddingFeatureUpsellTooltip } from "./warnings/WithSimpleEmbeddingFeatureUpsellTooltip";

export const SelectEmbedOptionsStep = () => (
  <Stack gap="md">
    <AuthenticationSection />
    <BehaviorSection />
    <ParametersSection />
    <AppearanceSection />
    <LegacyStaticEmbeddingAlert />
  </Stack>
);

const AuthenticationSection = () => {
  const {
    isSimpleEmbedFeatureAvailable,
    experience,
    settings,
    updateSettings,
  } = useSdkIframeEmbedSetupContext();

  const isQuestionOrDashboardEmbed = isQuestionOrDashboardSettings(
    experience,
    settings,
  );

  const isJwtEnabled = useSetting("jwt-enabled");
  const isSamlEnabled = useSetting("saml-enabled");
  const isJwtConfigured = useSetting("jwt-configured");
  const isSamlConfigured = useSetting("saml-configured");

  const isSsoEnabledAndConfigured =
    (isJwtEnabled && isJwtConfigured) || (isSamlEnabled && isSamlConfigured);

  const authType = getAuthTypeForSettings(settings);

  const handleAuthTypeChange = (value: string) => {
    const isGuest = value === "guest-embed";
    const useExistingUserSession = value === "user-session";

    updateSettings({
      isGuest,
      useExistingUserSession,
    });
  };

  /* eslint-disable-next-line no-literal-metabase-strings -- this string is only shown for admins. */
  const existingMetabaseSessionLabel = t`Existing Metabase session`;

  return (
    <Card p="md">
      <Stack gap="md" p="xs">
        <Text size="lg" fw="bold">
          {t`Authentication`}
        </Text>

        <Radio.Group value={authType} onChange={handleAuthTypeChange}>
          <Stack gap="sm">
            {isQuestionOrDashboardEmbed && (
              <WithGuestEmbedsDisabledWarning>
                {({ disabled }) => (
                  <Radio
                    disabled={disabled}
                    value="guest-embed"
                    label={t`Guest`}
                  />
                )}
              </WithGuestEmbedsDisabledWarning>
            )}

            <WithSimpleEmbeddingFeatureUpsellTooltip
              enableTooltip={!isSimpleEmbedFeatureAvailable}
              campaign={UPSELL_CAMPAIGN_AUTH}
            >
              {({ disabled }) => (
                <Radio
                  value="user-session"
                  label={
                    disabled ? (
                      existingMetabaseSessionLabel
                    ) : (
                      <Flex align="center" gap="xs">
                        <Text>{existingMetabaseSessionLabel}</Text>
                        <HoverCard position="bottom">
                          <HoverCard.Target>
                            <Icon
                              name="info"
                              size={14}
                              c="text-medium"
                              cursor="pointer"
                              style={{ flexShrink: 0 }}
                            />
                          </HoverCard.Target>
                          <HoverCard.Dropdown>
                            <Text lh="md" p="md" style={{ width: 300 }}>
                              {/* eslint-disable-next-line no-literal-metabase-strings -- this string is only shown for admins. */}
                              {t`This option lets you test Embedded Analytics JS locally using your existing Metabase session cookie. This only works for testing locally, using your admin account and on this browser. This may not work on Safari and Firefox. We recommend testing this in Chrome.`}
                            </Text>
                          </HoverCard.Dropdown>
                        </HoverCard>
                      </Flex>
                    )
                  }
                  disabled={disabled}
                />
              )}
            </WithSimpleEmbeddingFeatureUpsellTooltip>

            <WithSimpleEmbeddingFeatureUpsellTooltip
              enableTooltip={!isSimpleEmbedFeatureAvailable}
              campaign={UPSELL_CAMPAIGN_AUTH}
            >
              {({ disabled }) => (
                <Radio
                  value="sso"
                  label={t`Single sign-on (SSO)`}
                  disabled={disabled || !isSsoEnabledAndConfigured}
                />
              )}
            </WithSimpleEmbeddingFeatureUpsellTooltip>
          </Stack>
        </Radio.Group>

        {authType === "sso" && (
          <Text size="sm" c="text-medium">
            {t`Select this option if you have already set up SSO. This option relies on SSO to sign in your application users into the embedded iframe, and groups and permissions to enforce limits on what users can access. `}
          </Text>
        )}
      </Stack>
    </Card>
  );
};

const BehaviorSection = () => {
  const { settings, updateSettings } = useSdkIframeEmbedSetupContext();

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
              updateSettings({ isSaveEnabled: e.target.checked })
            }
          />
        ),
      )
      .with(
        { componentName: "metabase-question", questionId: P.nonNullable },
        (settings) => (
          <Stack gap="md">
            <WithNotAvailableForGuestEmbedsWarning
              campaign={UPSELL_CAMPAIGN_BEHAVIOR}
            >
              {({ disabled }) => (
                <Checkbox
                  label={t`Allow people to drill through on data points`}
                  disabled={disabled}
                  checked={settings.drills}
                  onChange={(e) => updateSettings({ drills: e.target.checked })}
                />
              )}
            </WithNotAvailableForGuestEmbedsWarning>

            <WithNotAvailableWithoutSimpleEmbeddingFeatureWarning
              campaign={UPSELL_CAMPAIGN_BEHAVIOR}
            >
              {({ disabled }) => (
                <Checkbox
                  label={t`Allow downloads`}
                  disabled={disabled}
                  checked={settings.withDownloads}
                  onChange={(e) =>
                    updateSettings({ withDownloads: e.target.checked })
                  }
                />
              )}
            </WithNotAvailableWithoutSimpleEmbeddingFeatureWarning>

            <WithNotAvailableForGuestEmbedsWarning
              campaign={UPSELL_CAMPAIGN_BEHAVIOR}
            >
              {({ disabled }) => (
                <Checkbox
                  label={t`Allow people to save new questions`}
                  disabled={disabled}
                  checked={settings.isSaveEnabled}
                  onChange={(e) =>
                    updateSettings({ isSaveEnabled: e.target.checked })
                  }
                />
              )}
            </WithNotAvailableForGuestEmbedsWarning>
          </Stack>
        ),
      )
      .with(
        { componentName: "metabase-dashboard", dashboardId: P.nonNullable },
        (settings) => (
          <Stack gap="md">
            <WithNotAvailableForGuestEmbedsWarning
              campaign={UPSELL_CAMPAIGN_BEHAVIOR}
            >
              {({ disabled }) => (
                <Checkbox
                  label={t`Allow people to drill through on data points`}
                  disabled={disabled}
                  checked={settings.drills}
                  onChange={(e) => updateSettings({ drills: e.target.checked })}
                />
              )}
            </WithNotAvailableForGuestEmbedsWarning>

            <WithNotAvailableWithoutSimpleEmbeddingFeatureWarning
              campaign={UPSELL_CAMPAIGN_BEHAVIOR}
            >
              {({ disabled }) => (
                <Checkbox
                  label={t`Allow downloads`}
                  disabled={disabled}
                  checked={settings.withDownloads}
                  onChange={(e) =>
                    updateSettings({ withDownloads: e.target.checked })
                  }
                />
              )}
            </WithNotAvailableWithoutSimpleEmbeddingFeatureWarning>
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
            onChange={(e) => updateSettings({ readOnly: !e.target.checked })}
          />
        ),
      )
      .otherwise(() => null);
  }, [settings, updateSettings]);

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

      <Text size="sm" c="text-medium" mb="lg">
        {experience === "dashboard"
          ? t`Set default values and control visibility`
          : t`Set default values`}
      </Text>

      <ParameterSettings />
    </Card>
  );
};

const AppearanceSection = () => {
  const { settings, updateSettings } = useSdkIframeEmbedSetupContext();

  const { theme } = settings;

  const updateColors = useCallback(
    (nextColors: Partial<MetabaseColors>) => {
      updateSettings({
        theme: { ...theme, colors: { ...theme?.colors, ...nextColors } },
      });
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
            onChange={(e) => updateSettings({ withTitle: e.target.checked })}
          />
        );
      },
    )
    .otherwise(() => null);

  return (
    <Card p="md">
      <WithNotAvailableWithoutSimpleEmbeddingFeatureWarning
        mode="custom"
        campaign={UPSELL_CAMPAIGN_BEHAVIOR}
      >
        {({ disabled, hoverCard }) => (
          <ColorCustomizationSection
            theme={theme}
            disabled={disabled}
            hoverCard={hoverCard}
            onColorChange={updateColors}
            onColorReset={() => updateSettings({ theme: undefined })}
          />
        )}
      </WithNotAvailableWithoutSimpleEmbeddingFeatureWarning>

      {appearanceSection && <Divider mt="lg" mb="md" />}
      {appearanceSection}
    </Card>
  );
};

const WithGuestEmbedsDisabledWarning = ({
  children,
}: {
  children: (data: { disabled: boolean }) => ReactNode;
}) => {
  const { isGuestEmbedsEnabled } = useSdkIframeEmbedSetupContext();

  const disabled = !isGuestEmbedsEnabled;

  return (
    <TooltipWarning
      warning={
        <Text lh="md" p="md">
          {t`Disabled in the admin settings`}
        </Text>
      }
      disabled={disabled}
    >
      {children}
    </TooltipWarning>
  );
};

const WithNotAvailableWithoutSimpleEmbeddingFeatureWarning = ({
  mode,
  children,
  campaign,
}: {
  mode?: TooltipWarningMode;
  children: (data: { disabled: boolean; hoverCard: ReactNode }) => ReactNode;
  campaign: string;
}) => {
  const { isSimpleEmbedFeatureAvailable } = useSdkIframeEmbedSetupContext();

  return (
    <WithSimpleEmbeddingFeatureUpsellTooltip
      mode={mode}
      enableTooltip={!isSimpleEmbedFeatureAvailable}
      campaign={campaign}
    >
      {({ disabled, hoverCard }) => children({ disabled, hoverCard })}
    </WithSimpleEmbeddingFeatureUpsellTooltip>
  );
};

const WithNotAvailableForGuestEmbedsWarning = ({
  mode,
  children,
  campaign,
}: {
  mode?: TooltipWarningMode;
  children: (data: { disabled: boolean; hoverCard: ReactNode }) => ReactNode;
  campaign: string;
}) => {
  const { settings } = useSdkIframeEmbedSetupContext();

  return (
    <WithNotAvailableWithoutSimpleEmbeddingFeatureWarning
      mode={mode}
      campaign={campaign}
    >
      {({ disabled: disabledForOss, hoverCard: disabledForOssHoverCard }) => (
        <TooltipWarning
          enableTooltip={!disabledForOss}
          warning={
            <Text lh="md" p="md">
              {t`Not available if Guest Mode is selected`}
            </Text>
          }
          disabled={!!settings.isGuest}
        >
          {({
            disabled: disabledForGuestEmbeds,
            hoverCard: disabledForGuestEmbedsHoverCard,
          }) =>
            children({
              disabled: disabledForOss || disabledForGuestEmbeds,
              hoverCard:
                disabledForOssHoverCard || disabledForGuestEmbedsHoverCard,
            })
          }
        </TooltipWarning>
      )}
    </WithNotAvailableWithoutSimpleEmbeddingFeatureWarning>
  );
};
