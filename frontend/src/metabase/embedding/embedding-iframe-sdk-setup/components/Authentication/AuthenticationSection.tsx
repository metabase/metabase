import type { ReactNode } from "react";
import { Link } from "react-router";
import { c, t } from "ttag";

import { useSdkIframeEmbedSetupContext } from "metabase/embedding/embedding-iframe-sdk-setup/context";
import {
  DEFAULT_EXPERIENCE,
  useHandleExperienceChange,
} from "metabase/embedding/embedding-iframe-sdk-setup/hooks/use-handle-experience-change";
import { getAuthTypeForSettings } from "metabase/embedding/embedding-iframe-sdk-setup/utils/get-auth-type-for-settings";
import { isQuestionOrDashboardExperience } from "metabase/embedding/embedding-iframe-sdk-setup/utils/is-question-or-dashboard-experience";
import { isStepWithResource } from "metabase/embedding/embedding-iframe-sdk-setup/utils/is-step-with-resource";
import { useDispatch } from "metabase/lib/redux";
import { isEEBuild } from "metabase/lib/utils";
import { closeModal } from "metabase/redux/ui";
import { Card, Flex, HoverCard, Icon, Radio, Stack, Text } from "metabase/ui";

export const AuthenticationSection = () => {
  const {
    experience,
    isSimpleEmbedFeatureAvailable,
    isFirstStep,
    currentStep,
    settings,
    updateSettings,
  } = useSdkIframeEmbedSetupContext();
  const handleEmbedExperienceChange = useHandleExperienceChange();

  if (!isFirstStep) {
    return null;
  }

  const authType = getAuthTypeForSettings(settings);

  const handleAuthTypeChange = (value: string) => {
    const isGuest = value === "guest-embed";
    const isSso = value === "sso";

    // Reset experience to default when switching to guest embeds from non-supported experience
    const shouldSwitchExperience =
      isGuest &&
      !isStepWithResource(currentStep) &&
      !isQuestionOrDashboardExperience(experience);

    if (shouldSwitchExperience) {
      handleEmbedExperienceChange(DEFAULT_EXPERIENCE);
    }

    updateSettings({
      isGuest,
      isSso,
    });
  };

  return (
    <Card p="md">
      <Stack gap="md" p="xs">
        <Text size="lg" fw="bold">
          {t`Authentication`}
        </Text>

        <Radio.Group value={authType} onChange={handleAuthTypeChange}>
          <Stack gap="sm">
            <WithGuestEmbedsDisabledWarning>
              {({ disabled }) => (
                <Radio
                  disabled={disabled}
                  value="guest-embed"
                  label={t`Guest`}
                />
              )}
            </WithGuestEmbedsDisabledWarning>

            <Radio
              value="sso"
              label={
                // eslint-disable-next-line no-literal-metabase-strings -- Public Facing string
                t`Metabase account (SSO)`
              }
              disabled={!isSimpleEmbedFeatureAvailable}
            />
          </Stack>
        </Radio.Group>
      </Stack>
    </Card>
  );
};

const WithGuestEmbedsDisabledWarning = ({
  children,
}: {
  children: (data: { disabled: boolean }) => ReactNode;
}) => {
  const dispatch = useDispatch();

  const { isGuestEmbedsEnabled } = useSdkIframeEmbedSetupContext();

  // We show the icon only in the EE build. For the OSS build we show the EnableEmbeddingCard
  const showIcon = isEEBuild();

  return (
    <Flex align="center" gap="xs">
      {children({ disabled: !isGuestEmbedsEnabled })}

      <HoverCard>
        {showIcon && !isGuestEmbedsEnabled && (
          <HoverCard.Target>
            <Icon
              data-testid="guest-embeds-disabled-info-icon"
              name="info"
              size={14}
              c="text-secondary"
            />
          </HoverCard.Target>
        )}

        <HoverCard.Dropdown p="sm">
          <Text>{c(
            "{0} is a link to guest embeds settings page with text 'admin settings'",
          ).jt`You can enable guest embeds in ${(
            <Link
              key="admin-settings-link"
              to="/admin/embedding/guest"
              onClick={() => dispatch(closeModal())}
            >
              <Text display="inline" c="text-brand" fw="bold">{c(
                "is a link in a sentence 'You can enable guest embeds in admin settings'",
              ).t`admin settings`}</Text>
            </Link>
          )}`}</Text>
        </HoverCard.Dropdown>
      </HoverCard>
    </Flex>
  );
};
