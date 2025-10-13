import cx from "classnames";
import { P, match } from "ts-pattern";
import { t } from "ttag";
import _ from "underscore";

import { useSetting } from "metabase/common/hooks";
import CS from "metabase/css/core/index.css";
import { PLUGIN_METABOT } from "metabase/plugins";
import { Card, Radio, Stack, Text } from "metabase/ui";
import { ALLOWED_EMBED_SETTING_KEYS_MAP } from "metabase-enterprise/embedding_iframe_sdk/constants";

import {
  EMBED_FALLBACK_DASHBOARD_ID,
  EMBED_FALLBACK_QUESTION_ID,
  getEmbedExperiences,
} from "../constants";
import { useSdkIframeEmbedSetupContext } from "../context";
import type { SdkIframeEmbedSetupExperience } from "../types";
import { getDefaultSdkIframeEmbedSettings } from "../utils/get-default-sdk-iframe-embed-setting";

import { EnableEmbeddedAnalyticsCard } from "./EnableEmbeddedAnalyticsCard";

export const SelectEmbedExperienceStep = () => {
  const {
    experience,
    settings,
    replaceSettings,
    recentDashboards,
    recentQuestions,
  } = useSdkIframeEmbedSetupContext();

  const isSimpleEmbeddingEnabled = useSetting("enable-embedding-simple");
  const isMetabotAvailable = PLUGIN_METABOT.isEnabled();

  const handleEmbedExperienceChange = (
    experience: SdkIframeEmbedSetupExperience,
  ) => {
    const persistedSettings = _.pick(
      settings,
      ALLOWED_EMBED_SETTING_KEYS_MAP.base,
    );

    // Use the most recent item for the selected type.
    // If the activity log is completely empty, use the fallback.
    const defaultResourceId = match(experience)
      .with("chart", () => recentQuestions[0]?.id ?? EMBED_FALLBACK_QUESTION_ID)
      .with(
        "dashboard",
        () => recentDashboards[0]?.id ?? EMBED_FALLBACK_DASHBOARD_ID,
      )
      .with(P.union("exploration", "browser", "metabot"), () => 0) // resource id does not apply
      .exhaustive();

    replaceSettings({
      // these settings do not change when the embed type changes
      ...persistedSettings,

      // these settings are overridden when the embed type changes
      ...getDefaultSdkIframeEmbedSettings({
        experience,
        resourceId: defaultResourceId,
      }),
    });
  };

  const experiences = getEmbedExperiences({ isMetabotAvailable });

  return (
    <>
      <EnableEmbeddedAnalyticsCard />

      <Card
        p="md"
        mb="md"
        opacity={isSimpleEmbeddingEnabled ? 1 : 0.5}
        className={cx(!isSimpleEmbeddingEnabled && CS.pointerEventsNone)}
      >
        <Text size="lg" fw="bold" mb="md">
          {t`Select your embed experience`}
        </Text>

        <Radio.Group
          value={experience}
          onChange={(experience) =>
            handleEmbedExperienceChange(
              experience as SdkIframeEmbedSetupExperience,
            )
          }
        >
          <Stack gap="md">
            {experiences.map((experience) => (
              <Radio
                key={experience.value}
                value={experience.value}
                label={experience.title}
                description={experience.description}
              />
            ))}
          </Stack>
        </Radio.Group>
      </Card>
    </>
  );
};
