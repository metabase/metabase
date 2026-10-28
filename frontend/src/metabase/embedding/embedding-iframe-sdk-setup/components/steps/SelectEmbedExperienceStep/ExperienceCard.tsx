import { t } from "ttag";

import { useHasTokenFeature } from "metabase/common/hooks";
import type { SdkIframeEmbedSetupExperience } from "metabase/embedding/types";
import { useMetabotEnabledEmbeddingAware } from "metabase/metabot/hooks";
import { Alert, Card, Flex, Radio, Stack, Text } from "metabase/ui";

import { getEmbedExperiences } from "../../../constants";
import { useSdkIframeEmbedSetupContext } from "../../../context";
import { useHandleExperienceChange } from "../../../hooks/use-handle-experience-change";
import { hasAuthToSelect } from "../../../utils/has-auth-to-select";
import { SetupSsoAlert } from "../../Common/SetupSsoAlert";

export const ExperienceCard = () => {
  const {
    isSimpleEmbedFeatureAvailable,
    isSsoEnabledAndConfigured,
    experience,
    settings,
  } = useSdkIframeEmbedSetupContext();

  const isGuestEmbed = !!settings.isGuest;
  const isDataAppsAvailable = useHasTokenFeature("data-apps");
  const isMetabotAvailable = useMetabotEnabledEmbeddingAware({
    forceEmbedding: true,
  });

  const handleEmbedExperienceChange = useHandleExperienceChange();

  const experiences = getEmbedExperiences({
    isMetabotAvailable,
    isDataAppsAvailable,
  });

  const showSsoNotConfiguredWarning =
    !isSsoEnabledAndConfigured && !hasAuthToSelect(experience);

  return (
    <Card p="lg">
      <Stack gap="lg">
        <Text size="lg" fw="bold">
          {t`Select your embed experience`}
        </Text>

        <Radio.Group
          value={experience}
          onChange={(experience) =>
            handleEmbedExperienceChange(
              // Unjustified type cast. FIXME
              experience as SdkIframeEmbedSetupExperience,
            )
          }
        >
          <Stack gap="lg">
            {experiences.map((experience) => (
              <Radio
                key={experience.value}
                value={experience.value}
                label={
                  <Flex gap="xxs" align="center">
                    {experience.title}
                  </Flex>
                }
                description={experience.description}
                disabled={
                  (!experience.supportsOss && !isSimpleEmbedFeatureAvailable) ||
                  (!experience.supportsGuestEmbed &&
                    isGuestEmbed &&
                    experience.value !== "app")
                }
              />
            ))}
          </Stack>
        </Radio.Group>

        {showSsoNotConfiguredWarning &&
          (experience === "app" ? (
            <Alert color="warning">{t`Configure JWT or SAML single sign-on to embed a data app.`}</Alert>
          ) : (
            <SetupSsoAlert />
          ))}
      </Stack>
    </Card>
  );
};
