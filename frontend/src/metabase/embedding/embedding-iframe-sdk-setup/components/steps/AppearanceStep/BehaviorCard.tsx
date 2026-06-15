import { useMemo } from "react";
import { Link } from "react-router";
import { P, match } from "ts-pattern";
import { c, t } from "ttag";

import { UpsellGem } from "metabase/common/components/upsells/components/UpsellGem";
import { useDocsUrl, useHasEmailSetup } from "metabase/common/hooks";
import {
  Anchor,
  Card,
  Checkbox,
  Flex,
  HoverCard,
  Icon,
  Stack,
  Text,
  Tooltip,
} from "metabase/ui";

import { useSdkIframeEmbedSetupContext } from "../../../context";
import { getBehaviorDocsUrlParams } from "../../../utils/get-behavior-docs-url-params";
import { WithNotAvailableForOssOrGuestEmbedsGuard } from "../../Common/WithNotAvailableForOssOrGuestEmbedsGuard";

export const BehaviorCard = () => {
  const { isSimpleEmbedFeatureAvailable, settings, updateSettings } =
    useSdkIframeEmbedSetupContext();
  const hasEmailSetup = useHasEmailSetup();

  const behaviorDocsParams = getBehaviorDocsUrlParams(settings);
  // eslint-disable-next-line metabase/no-unconditional-metabase-links-render -- Only admins can see the EmbedJS Wizard
  const { url: behaviorDocsUrl } = useDocsUrl(behaviorDocsParams?.page ?? "", {
    anchor: behaviorDocsParams?.anchor,
  });

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
      .with({ componentName: "metabase-metabot" }, (settings) => (
        <Checkbox
          label={t`Allow people to save new questions`}
          checked={settings.isSaveEnabled}
          onChange={(e) =>
            updateSettings({
              isSaveEnabled: e.target.checked,
            } satisfies Partial<typeof settings>)
          }
        />
      ))
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
      <Flex align="center" justify="space-between" gap="xs" mb="md">
        <Flex align="center" gap="xs">
          <Text size="lg" fw="bold">
            {t`Behavior`}
          </Text>
          {!isSimpleEmbedFeatureAvailable && (
            // eslint-disable-next-line metabase/no-literal-metabase-strings -- Only admins can see the EmbedJS Wizard
            <Tooltip label={t`Available on Metabase Pro plans`}>
              <Flex align="center">
                <UpsellGem />
              </Flex>
            </Tooltip>
          )}
        </Flex>
        {!!behaviorDocsParams?.page && (
          <Anchor
            data-testid="behavior-docs-link"
            href={behaviorDocsUrl}
            target="_blank"
            rel="noreferrer"
            c="core-brand"
            lh={1}
          >
            <Icon
              name="book_open"
              size={16}
              tooltip={t`See all properties in the docs`}
            />
          </Anchor>
        )}
      </Flex>

      {behaviorSection}
    </Card>
  );
};
