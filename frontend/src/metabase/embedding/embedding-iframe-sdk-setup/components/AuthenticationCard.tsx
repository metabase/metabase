import { useRef, useState } from "react";
import { match } from "ts-pattern";
import { jt, t } from "ttag";

import { useUpdateSettingsMutation } from "metabase/api";
import { useToast } from "metabase/common/hooks";
import {
  Anchor,
  Button,
  Card,
  Group,
  HoverCard,
  Icon,
  Radio,
  Stack,
  Text,
} from "metabase/ui";
import type { EnterpriseSettings } from "metabase-types/api";

import { useSdkIframeEmbedSetupContext } from "../context";
import {
  DEFAULT_EXPERIENCE,
  useHandleExperienceChange,
} from "../hooks/use-handle-experience-change";
import { getAuthTypeForSettings } from "../utils/get-auth-type-for-settings";
import { getResourceTypeFromExperience } from "../utils/get-resource-type-from-experience";
import { isQuestionOrDashboardExperience } from "../utils/is-question-or-dashboard-experience";
import { isStepWithResource } from "../utils/is-step-with-resource";

import { DatabaseRoutingWarning } from "./DatabaseRoutingWarning";

export const AuthenticationCard = () => {
  const {
    experience,
    isSimpleEmbedFeatureAvailable,
    currentStep,
    settings,
    updateSettings,
    resource,
    isSimpleEmbeddingEnabled,
    isSimpleEmbeddingTermsAccepted,
    isGuestEmbedsEnabled,
    isGuestEmbedsTermsAccepted,
  } = useSdkIframeEmbedSetupContext();
  const handleEmbedExperienceChange = useHandleExperienceChange();

  const resourceType = getResourceTypeFromExperience(experience);
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
          <Stack gap="md">
            <Stack gap="sm">
              <Radio
                value="sso"
                label={
                  // eslint-disable-next-line metabase/no-literal-metabase-strings -- Public Facing string
                  t`Metabase account (SSO)`
                }
                disabled={!isSimpleEmbedFeatureAvailable}
              />
              {authType === "sso" &&
                isSimpleEmbedFeatureAvailable &&
                isSimpleEmbeddingEnabled !== undefined && (
                  <EnableEmbeddingSection
                    key={`modular-${currentStep}`}
                    embeddingType="modular-embedding"
                    isEnabled={isSimpleEmbeddingEnabled}
                    termsAccepted={isSimpleEmbeddingTermsAccepted}
                    settingsToUpdate={{
                      "enable-embedding-simple": true,
                      ...(!isSimpleEmbeddingTermsAccepted && {
                        "show-simple-embed-terms": false,
                      }),
                    }}
                    errorMessage={t`Failed to enable modular embedding`}
                  />
                )}
            </Stack>

            <Stack gap="sm">
              <Radio value="guest-embed" label={t`Guest`} />
              {authType === "guest-embed" && (
                <>
                  {resource && resourceType && (
                    <DatabaseRoutingWarning
                      resource={resource}
                      resourceType={resourceType}
                    />
                  )}
                  {isGuestEmbedsEnabled !== undefined && (
                    <EnableEmbeddingSection
                      key={`guest-${currentStep}`}
                      embeddingType="guest-embeds"
                      isEnabled={isGuestEmbedsEnabled}
                      termsAccepted={isGuestEmbedsTermsAccepted}
                      settingsToUpdate={{
                        "enable-embedding-static": true,
                        ...(!isGuestEmbedsTermsAccepted && {
                          "show-static-embed-terms": false,
                        }),
                      }}
                      errorMessage={t`Failed to enable guest embeds`}
                    />
                  )}
                </>
              )}
            </Stack>
          </Stack>
        </Radio.Group>
      </Stack>
    </Card>
  );
};

interface EnableEmbeddingSectionProps {
  embeddingType: "guest-embeds" | "modular-embedding";
  isEnabled: boolean;
  termsAccepted: boolean;
  settingsToUpdate: Partial<EnterpriseSettings>;
  errorMessage: string;
}

const EnableEmbeddingSection = ({
  embeddingType,
  isEnabled,
  termsAccepted,
  settingsToUpdate,
  errorMessage,
}: EnableEmbeddingSectionProps) => {
  const [updateSettings] = useUpdateSettingsMutation();
  const [sendToast] = useToast();

  const isAccepted = isEnabled && termsAccepted;

  // Freeze visibility so the "Enabled" button state stays on screen
  // after the user enables the setting.
  const [showSection] = useState(!isAccepted);

  const initialDataRef = useRef({ isEnabled, termsAccepted });

  const handleEnableEmbedding = async () => {
    try {
      await updateSettings(settingsToUpdate);
    } catch (error) {
      sendToast({ message: errorMessage });
    }
  };

  if (!showSection) {
    return null;
  }

  const embeddingTypeLocalized = match(embeddingType)
    .with("guest-embeds", () => t`guest embeds`)
    .with("modular-embedding", () => t`modular embedding`)
    .exhaustive();

  const data = match(initialDataRef.current)
    .with(
      {
        isEnabled: false,
        termsAccepted: false,
      },
      () => ({
        title:
          embeddingType === "guest-embeds"
            ? jt`To continue, enable guest embeds and agree to the ${(
                <Anchor
                  key="usage-conditions"
                  href="https://metabase.com/license/embedding"
                  target="_blank"
                >
                  {t`usage conditions`}
                </Anchor>
              )}.`
            : t`To continue, enable ${embeddingTypeLocalized} and agree to the usage conditions.`,
        buttonCaption: t`Agree and enable`,
      }),
    )
    .with(
      {
        isEnabled: true,
        termsAccepted: false,
      },
      () => ({
        title:
          embeddingType === "guest-embeds"
            ? jt`Agree to the ${(
                <Anchor
                  key="usage-conditions"
                  href="https://metabase.com/license/embedding"
                  target="_blank"
                >
                  {t`usage conditions`}
                </Anchor>
              )} to continue.`
            : t`Agree to the usage conditions to continue.`,
        buttonCaption: t`Agree and continue`,
      }),
    )
    .with(
      {
        isEnabled: false,
        termsAccepted: true,
      },
      () => ({
        title: t`Enable ${embeddingTypeLocalized} to get started.`,
        buttonCaption: t`Enable and continue`,
      }),
    )
    .otherwise(() => null);

  if (!data) {
    return null;
  }

  const { title, buttonCaption } = data;

  return (
    <Stack gap={0} pl="xl" data-testid="enable-embedding-card" mt="xs" mb="sm">
      <Text fz="md" c="text-primary">
        {title}

        {!termsAccepted && (
          <HoverCard position="bottom" withArrow>
            <HoverCard.Target>
              <Icon
                name="info"
                size={14}
                c="text-secondary"
                ml="sm"
                style={{ verticalAlign: "middle" }}
              />
            </HoverCard.Target>

            <HoverCard.Dropdown>
              <Stack maw={340} p="md" gap="md">
                {match(embeddingType)
                  .with("guest-embeds", () => <GuestEmbedsTooltipContent />)
                  .with("modular-embedding", () => (
                    <ModularEmbeddingTooltipContent />
                  ))
                  .exhaustive()}
              </Stack>
            </HoverCard.Dropdown>
          </HoverCard>
        )}
      </Text>

      <Group justify="flex-start" mt="xs">
        <Button
          variant={isAccepted ? "default" : "filled"}
          onClick={handleEnableEmbedding}
          size="xs"
          disabled={isAccepted}
          leftSection={isAccepted && <Icon name="check" />}
        >
          {isAccepted ? "Enabled" : buttonCaption}
        </Button>
      </Group>
    </Stack>
  );
};

const GuestEmbedsTooltipContent = () => (
  <>
    <Text fz="sm" lh="lg">
      {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- Only admins, at the moment, should see this */}
      {t`When you embed charts or dashboards from Metabase in your
        own application, that application isn't subject to the Affero
        General Public License that covers the rest of Metabase,
        provided you keep the Metabase logo and the "Powered by
        Metabase" visible on those embeds.`}
    </Text>

    <Text fz="sm" lh="lg">
      {t`You should, however, read the license text linked above as that is the actual license that you will be agreeing to by enabling this feature.`}
    </Text>
  </>
);

const ModularEmbeddingTooltipContent = () => (
  <>
    <Text fz="sm" lh="lg">
      {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- Only admins, at the moment, should see this */}
      {t`When using modular embedding, each end user must have their own Metabase account.`}
    </Text>

    <Text fz="sm" lh="lg">
      {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- Only admins, at the moment, should see this */}
      {t`Sharing Metabase accounts is a security risk. Even if you filter data on the client side, each user could use their token to view any data visible to that shared user account.`}
    </Text>

    <Text fz="sm" lh="lg">
      {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- Only admins, at the moment, should see this */}
      {t`That, and we consider shared accounts to be unfair usage. Fair usage involves giving each end-user of the embedded analytics their own Metabase account.`}
    </Text>
  </>
);
