import { useCallback } from "react";
import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
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
import { ParameterSettings } from "./ParameterSettings";

export const SelectEmbedOptionsStep = () => {
  const { experience, settings, updateSettings } =
    useSdkIframeEmbedSetupContext();

  const isStaticEmbedding = !!settings.isStatic;
  const { theme } = settings;

  const isQuestionOrDashboardEmbed =
    (experience === "dashboard" && settings.dashboardId) ||
    (experience === "chart" && settings.questionId);

  const isBrowserComponent = settings.componentName === "metabase-browser";
  const isQuestionComponent = settings.componentName === "metabase-question";

  const updateColors = useCallback(
    (nextColors: Partial<MetabaseColors>) => {
      updateSettings({
        theme: { ...theme, colors: { ...theme?.colors, ...nextColors } },
      });
    },
    [theme, updateSettings],
  );

  const isDashboardOrQuestion = settings.dashboardId || settings.questionId;

  const isJwtEnabled = useSetting("jwt-enabled");
  const isSamlEnabled = useSetting("saml-enabled");
  const isJwtConfigured = useSetting("jwt-configured");
  const isSamlConfigured = useSetting("saml-configured");

  const isSsoEnabledAndConfigured =
    (isJwtEnabled && isJwtConfigured) || (isSamlEnabled && isSamlConfigured);

  const authType = settings.isStatic
    ? "no-user"
    : settings.useExistingUserSession
      ? "user-session"
      : "sso";

  const handleAuthTypeChange = (value: string) => {
    const isStatic = value === "no-user";
    const useExistingUserSession = value === "user-session";

    updateSettings({
      isStatic,
      useExistingUserSession,
    });
  };

  return (
    <Stack gap="md">
      <Card p="md">
        <Stack gap="md" p="xs">
          <Text size="lg" fw="bold">
            {t`Authentication`}
          </Text>

          <Text size="sm" c="text-medium">
            {t`Choose the authentication method for embedding:`}
          </Text>

          <Radio.Group value={authType} onChange={handleAuthTypeChange}>
            <Stack gap="sm">
              <Radio
                value="user-session"
                label={
                  <Flex align="center" gap="xs">
                    {/* eslint-disable-next-line no-literal-metabase-strings -- this string is only shown for admins. */}
                    <Text>{t`Existing Metabase session`}</Text>
                    <HoverCard position="bottom">
                      <HoverCard.Target>
                        <Icon
                          name="info"
                          size={14}
                          c="text-medium"
                          cursor="pointer"
                        />
                      </HoverCard.Target>
                      <HoverCard.Dropdown>
                        <Text size="sm" p="md" style={{ width: 300 }}>
                          {/* eslint-disable-next-line no-literal-metabase-strings -- this string is only shown for admins. */}
                          {t`This option lets you test Embedded Analytics JS locally using your existing Metabase session cookie. This only works for testing locally, using your admin account and on this browser. This may not work on Safari and Firefox. We recommend testing this in Chrome.`}
                        </Text>
                      </HoverCard.Dropdown>
                    </HoverCard>
                  </Flex>
                }
              />

              <Radio
                value="sso"
                label={t`Single sign-on (SSO)`}
                disabled={!isSsoEnabledAndConfigured}
              />

              {isQuestionOrDashboardEmbed && (
                <Radio
                  value="no-user"
                  label={
                    <Flex align="center" gap="xs">
                      {/* eslint-disable-next-line no-literal-metabase-strings -- this string is only shown for admins. */}
                      <Text>{t`Without user`}</Text>
                      <HoverCard position="bottom">
                        <HoverCard.Target>
                          <Icon
                            name="info"
                            size={14}
                            c="text-medium"
                            cursor="pointer"
                          />
                        </HoverCard.Target>
                        <HoverCard.Dropdown>
                          <Text size="sm" p="md" style={{ width: 300 }}>
                            {/* eslint-disable-next-line no-literal-metabase-strings -- this string is only shown for admins. */}
                            {t`This option lets you run Embedded Analytics JS without a user authorization.`}
                          </Text>
                        </HoverCard.Dropdown>
                      </HoverCard>
                    </Flex>
                  }
                />
              )}
            </Stack>
          </Radio.Group>

          {authType === "sso" && (
            <Text size="sm" c="text-medium">
              {t`Select this option if you have already set up SSO. This option relies on SSO to sign in your application users into the embedded iframe, and groups and permissions to enforce limits on what users can access. `}
            </Text>
          )}
        </Stack>
      </Card>

      <Card p="md">
        <Text size="lg" fw="bold" mb="md">
          {t`Behavior`}
        </Text>
        <Stack gap="md">
          {isQuestionOrDashboardEmbed && (
            <Checkbox
              label={t`Allow people to drill through on data points`}
              checked={settings.drills}
              onChange={(e) => updateSettings({ drills: e.target.checked })}
            />
          )}

          {isDashboardOrQuestion && (
            <Checkbox
              label={t`Allow downloads`}
              checked={settings.withDownloads}
              onChange={(e) =>
                updateSettings({ withDownloads: e.target.checked })
              }
            />
          )}

          {!isStaticEmbedding && isQuestionComponent && (
            <Checkbox
              label={t`Allow people to save new questions`}
              checked={settings.isSaveEnabled}
              onChange={(e) =>
                updateSettings({ isSaveEnabled: e.target.checked })
              }
            />
          )}

          {!isStaticEmbedding && isBrowserComponent && (
            <Checkbox
              label={t`Allow editing dashboards and questions`}
              checked={!settings.readOnly}
              onChange={(e) => updateSettings({ readOnly: !e.target.checked })}
            />
          )}
        </Stack>
      </Card>

      {isQuestionOrDashboardEmbed && (
        <Card p="md">
          <Text size="lg" fw="bold" mb="xs">
            {t`Parameters`}
          </Text>

          <Text size="sm" c="text-medium" mb="lg">
            {experience === "dashboard"
              ? t`Set default values and control visibility`
              : t`Set default values for parameters`}
          </Text>

          <ParameterSettings />
        </Card>
      )}

      <Card p="md">
        <ColorCustomizationSection
          theme={theme}
          onColorChange={updateColors}
          onColorReset={() => updateSettings({ theme: undefined })}
        />

        {isQuestionOrDashboardEmbed && (
          <>
            <Divider mt="lg" mb="md" />

            <Checkbox
              label={t`Show ${experience} title`}
              checked={settings.withTitle}
              onChange={(e) => updateSettings({ withTitle: e.target.checked })}
            />
          </>
        )}
      </Card>
    </Stack>
  );
};
