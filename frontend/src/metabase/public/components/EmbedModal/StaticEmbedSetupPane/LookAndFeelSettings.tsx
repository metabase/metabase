import { match } from "ts-pattern";
import { jt, t } from "ttag";

import { UpsellMetabaseBanner } from "metabase/admin/upsells/UpsellMetabaseBanner";
import { useDocsUrl } from "metabase/common/hooks";
import ExternalLink from "metabase/core/components/ExternalLink";
import { color } from "metabase/lib/colors";
import { useSelector } from "metabase/lib/redux";
import type {
  EmbedResourceType,
  EmbeddingDisplayOptions,
} from "metabase/public/lib/types";
import { getSetting, getUpgradeUrl } from "metabase/selectors/settings";
import { getCanWhitelabel } from "metabase/selectors/whitelabel";
import {
  Divider,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Text,
} from "metabase/ui";

import { DisplayOptionSection } from "./StaticEmbedSetupPane.styled";
import { StaticEmbedSetupPaneSettingsContentSection } from "./StaticEmbedSetupPaneSettingsContentSection";

const THEME_OPTIONS = [
  { label: t`Light`, value: "light" },
  { label: t`Dark`, value: "night" },
] as const;
type ThemeOptions = (typeof THEME_OPTIONS)[number]["value"];

interface AppearanceSettingsProps {
  resourceType: EmbedResourceType;
  displayOptions: EmbeddingDisplayOptions;
  onChangeDisplayOptions: (displayOptions: EmbeddingDisplayOptions) => void;
}

export const LookAndFeelSettings = ({
  resourceType,
  displayOptions,
  onChangeDisplayOptions,
}: AppearanceSettingsProps): JSX.Element => {
  // eslint-disable-next-line no-unconditional-metabase-links-render -- Only appear to admins
  const { url: docsUrl } = useDocsUrl("embedding/static-embedding", {
    anchor: "customizing-the-appearance-of-static-embeds",
    utm: {
      utm_source: "product",
      utm_medium: "docs",
      utm_campaign: "embedding-static",
      utm_content: "static-embed-settings-look-and-feel",
    },
  });
  const upgradePageUrl = useSelector(state =>
    getUpgradeUrl(state, {
      utm_campaign: "embedding-static-font",
      utm_content: "static-embed-settings-look-and-feel",
    }),
  );
  const canWhitelabel = useSelector(getCanWhitelabel);
  const availableFonts = useSelector(state =>
    getSetting(state, "available-fonts"),
  );

  return (
    <>
      <StaticEmbedSetupPaneSettingsContentSection
        title={t`Customizing look and feel`}
      >
        <Stack spacing="1rem">
          <Text>{jt`These options require changing the server code. You can play around with and preview the options here. Check out the ${(
            <ExternalLink
              key="doc"
              href={docsUrl}
            >{t`documentation`}</ExternalLink>
          )} for more.`}</Text>

          {canWhitelabel ? (
            <Select
              label={
                <Text fw="bold" mb="0.25rem" lh="1rem">
                  Font
                </Text>
              }
              value={displayOptions.font}
              data={[
                {
                  label: t`Use instance font`,
                  // @ts-expect-error Mantine v6 and v7 both expect value to be a string
                  value: null,
                },
                ...availableFonts?.map(font => ({
                  label: font,
                  value: font,
                })),
              ]}
              onChange={value => {
                onChangeDisplayOptions({
                  ...displayOptions,
                  font: value,
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

          <DisplayOptionSection title={t`Theme`}>
            <SegmentedControl
              value={displayOptions.theme ?? undefined}
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

          {/**
           * We don't offer background options for question embeds because questions are displayed
           * as a single card, and we want to always show a solid card background on dashboards embeds.
           * (metabase#43838)
           */}
          {resourceType === "dashboard" && (
            <Switch
              label={t`Dashboard background`}
              labelPosition="left"
              size="sm"
              variant="stretch"
              checked={displayOptions.background}
              onChange={e =>
                onChangeDisplayOptions({
                  ...displayOptions,
                  background: e.target.checked,
                })
              }
            />
          )}

          <Switch
            label={getBorderLabel(resourceType)}
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

          {canWhitelabel && (
            <Switch
              label={t`Download buttons`}
              labelPosition="left"
              size="sm"
              variant="stretch"
              checked={displayOptions.downloads ?? true}
              onChange={e =>
                onChangeDisplayOptions({
                  ...displayOptions,
                  downloads: e.target.checked,
                })
              }
            />
          )}
        </Stack>
      </StaticEmbedSetupPaneSettingsContentSection>

      {!canWhitelabel && (
        <>
          <Divider my="2rem" />
          <div aria-label={t`Removing the banner`}>
            <UpsellMetabaseBanner />
          </div>
        </>
      )}
    </>
  );
};

function getBorderLabel(resourceType: EmbedResourceType) {
  return match(resourceType)
    .returnType<string>()
    .with("dashboard", () => t`Dashboard border`)
    .with("question", () => t`Question border`)
    .exhaustive();
}

function getTitleLabel(resourceType: EmbedResourceType) {
  if (resourceType === "dashboard") {
    return t`Dashboard title`;
  }

  if (resourceType === "question") {
    return t`Question title`;
  }

  return null;
}
