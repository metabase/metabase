import { match } from "ts-pattern";
import { jt, t } from "ttag";

import { UpsellMetabaseBanner } from "metabase/admin/upsells";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { useDocsUrl } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import type {
  DisplayTheme,
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

import {
  DashboardDownloadSettings,
  QuestionDownloadSettings,
} from "./DownloadSettings";
import { DisplayOptionSection } from "./StaticEmbedSetupPane.styled";
import { StaticEmbedSetupPaneSettingsContentSection } from "./StaticEmbedSetupPaneSettingsContentSection";

const THEME_OPTIONS = [
  {
    get label() {
      return t`Light`;
    },
    value: "light" as DisplayTheme,
  },
  {
    get label() {
      return t`Dark`;
    },
    value: "night" as DisplayTheme,
  },
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
  // eslint-disable-next-line metabase/no-unconditional-metabase-links-render -- Only appear to admins
  const { url: docsUrl } = useDocsUrl("embedding/static-embedding", {
    anchor: "customizing-the-appearance-of-static-embeds",
    utm: {
      utm_source: "product",
      utm_medium: "docs",
      utm_campaign: "embedding-static",
      utm_content: "static-embed-settings-look-and-feel",
    },
  });
  const upgradePageUrl = useSelector((state) =>
    getUpgradeUrl(state, {
      utm_campaign: "embedding-static-font",
      utm_content: "static-embed-settings-look-and-feel",
    }),
  );
  const canWhitelabel = useSelector(getCanWhitelabel);
  const availableFonts = useSelector((state) =>
    getSetting(state, "available-fonts"),
  );
  const isDashboard = resourceType === "dashboard";

  return (
    <>
      <StaticEmbedSetupPaneSettingsContentSection
        title={t`Customizing look and feel`}
      >
        <Stack gap="1rem">
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
                  {t`Font`}
                </Text>
              }
              value={displayOptions.font}
              data={[
                {
                  label: t`Use instance font`,
                  value: "",
                },
                ...(availableFonts?.map((font) => ({
                  label: font,
                  value: font,
                })) ?? []),
              ]}
              onChange={(value) => {
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
              data={[...THEME_OPTIONS]}
              fullWidth
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
              onChange={(e) =>
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
            onChange={(e) =>
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
            onChange={(e) =>
              onChangeDisplayOptions({
                ...displayOptions,
                titled: e.target.checked,
              })
            }
          />

          {canWhitelabel &&
            (isDashboard ? (
              <DashboardDownloadSettings
                displayOptions={displayOptions}
                onChangeDisplayOptions={onChangeDisplayOptions}
              />
            ) : (
              <QuestionDownloadSettings
                displayOptions={displayOptions}
                onChangeDisplayOptions={onChangeDisplayOptions}
              />
            ))}
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
    .with("document", () => t`Document border`)
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
