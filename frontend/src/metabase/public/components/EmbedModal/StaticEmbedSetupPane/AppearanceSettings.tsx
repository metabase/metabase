import type { ChangeEvent } from "react";
import { jt, t } from "ttag";

import { getPlan } from "metabase/common/utils/plan";
import ExternalLink from "metabase/core/components/ExternalLink";
import Select from "metabase/core/components/Select";
import { useUniqueId } from "metabase/hooks/use-unique-id";
import { color } from "metabase/lib/colors";
import { useSelector } from "metabase/lib/redux";
import type {
  EmbeddingDisplayOptions,
  EmbedResourceType,
} from "metabase/public/lib/types";
import {
  getDocsUrl,
  getSetting,
  getUpgradeUrl,
} from "metabase/selectors/settings";
import { getCanWhitelabel } from "metabase/selectors/whitelabel";
import { Divider, SegmentedControl, Stack, Switch, Text } from "metabase/ui";

import { DisplayOptionSection } from "./StaticEmbedSetupPane.styled";
import { StaticEmbedSetupPaneSettingsContentSection } from "./StaticEmbedSetupPaneSettingsContentSection";

const THEME_OPTIONS = [
  { label: t`Light`, value: "light" },
  { label: t`Dark`, value: "night" },
  { label: t`Transparent`, value: "transparent" },
] as const;
type ThemeOptions = typeof THEME_OPTIONS[number]["value"];

export interface AppearanceSettingsProps {
  resourceType: EmbedResourceType;
  displayOptions: EmbeddingDisplayOptions;

  onChangeDisplayOptions: (displayOptions: EmbeddingDisplayOptions) => void;
}

export const AppearanceSettings = ({
  resourceType,
  displayOptions,
  onChangeDisplayOptions,
}: AppearanceSettingsProps): JSX.Element => {
  const docsUrl = useSelector(state =>
    // eslint-disable-next-line no-unconditional-metabase-links-render -- Only appear to admins
    getDocsUrl(state, {
      page: "embedding/static-embedding",
    }),
  );
  const upgradePageUrl = useSelector(state =>
    getUpgradeUrl(state, { utm_media: "static-embed-settings-appearance" }),
  );
  const plan = useSelector(state =>
    getPlan(getSetting(state, "token-features")),
  );
  const canWhitelabel = useSelector(getCanWhitelabel);
  const availableFonts = useSelector(state =>
    getSetting(state, "available-fonts"),
  );
  const utmTags = `?utm_source=${plan}&utm_media=static-embed-settings-appearance`;

  const fontControlLabelId = useUniqueId("display-option");
  const downloadDataId = useUniqueId("download-data");

  return (
    <>
      <StaticEmbedSetupPaneSettingsContentSection
        title={t`Customizing your embed’s appearance`}
      >
        <Text>{jt`These cosmetic options requiring changing the server code. You can play around with and preview the options here, and check out the ${(
          <ExternalLink
            key="doc"
            href={`${docsUrl}${utmTags}#customizing-the-appearance-of-static-embeds`}
          >{t`documentation`}</ExternalLink>
        )} for more.`}</Text>
      </StaticEmbedSetupPaneSettingsContentSection>
      <StaticEmbedSetupPaneSettingsContentSection
        title={t`Playing with appearance options`}
        mt="2rem"
      >
        <Stack spacing="1rem">
          <DisplayOptionSection title={t`Background`}>
            <SegmentedControl
              value={displayOptions.theme}
              // `data` type is required to be mutable, but THEME_OPTIONS is const.
              data={[...THEME_OPTIONS]}
              fullWidth
              bg={color("bg-light")}
              onChange={(value: ThemeOptions) => {
                onChangeDisplayOptions({
                  ...displayOptions,
                  theme: value,
                });
              }}
            />
          </DisplayOptionSection>

          <Switch
            label={getTitleLabel(resourceType)}
            labelPosition="left"
            size="sm"
            variant="stretch"
            checked={displayOptions.titled}
            onChange={e =>
              onChangeDisplayOptions({
                ...displayOptions,
                titled: e.target.checked,
              })
            }
          />

          <Switch
            label={t`Border`}
            labelPosition="left"
            size="sm"
            variant="stretch"
            checked={displayOptions.bordered}
            onChange={e =>
              onChangeDisplayOptions({
                ...displayOptions,
                bordered: e.target.checked,
              })
            }
          />

          <DisplayOptionSection title={t`Font`} titleId={fontControlLabelId}>
            {canWhitelabel ? (
              <Select
                value={displayOptions.font}
                options={[
                  {
                    name: t`Use instance font`,
                    value: null,
                  },
                  ...availableFonts?.map(font => ({
                    name: font,
                    value: font,
                  })),
                ]}
                buttonProps={{
                  "aria-labelledby": fontControlLabelId,
                }}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                  onChangeDisplayOptions({
                    ...displayOptions,
                    font: e.target.value,
                  });
                }}
              />
            ) : (
              <Text>{jt`You can change the font with ${(
                <ExternalLink
                  key="fontPlan"
                  href={upgradePageUrl}
                >{t`a paid plan`}</ExternalLink>
              )}.`}</Text>
            )}
          </DisplayOptionSection>

          {canWhitelabel && resourceType === "question" && (
            // We only show the "Download Data" toggle if the users are pro/enterprise
            // and they're sharing a question metabase#23477
            <DisplayOptionSection
              title={t`Download data`}
              titleId={downloadDataId}
            >
              <Switch
                aria-labelledby={downloadDataId}
                label={t`Enable users to download data from this embed`}
                labelPosition="left"
                size="sm"
                variant="stretch"
                checked={!displayOptions.hide_download_button}
                onChange={e =>
                  onChangeDisplayOptions({
                    ...displayOptions,
                    hide_download_button: !e.target.checked,
                  })
                }
              />
            </DisplayOptionSection>
          )}
        </Stack>
      </StaticEmbedSetupPaneSettingsContentSection>
      {!canWhitelabel && (
        <>
          <Divider my="2rem" />
          <StaticEmbedSetupPaneSettingsContentSection
            // eslint-disable-next-line no-literal-metabase-strings -- This only shows for admins
            title={t`Removing the “Powered by Metabase” banner`}
          >
            {/* eslint-disable-next-line no-literal-metabase-strings -- This only shows for admins */}
            <Text>{jt`This banner appears on all static embeds created with the Metabase open source version. You’ll need to upgrade to ${(
              <ExternalLink
                key="bannerPlan"
                href={upgradePageUrl}
              >{t`a paid plan`}</ExternalLink>
            )} to remove the banner.`}</Text>
          </StaticEmbedSetupPaneSettingsContentSection>
        </>
      )}
    </>
  );
};

function getTitleLabel(resourceType: EmbedResourceType) {
  if (resourceType === "dashboard") {
    return t`Dashboard title`;
  }

  if (resourceType === "question") {
    return t`Question title`;
  }

  return null;
}
