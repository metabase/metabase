import { jt, t } from "ttag";
import ToggleLarge from "metabase/components/ToggleLarge";
import PreviewPane from "metabase/public/components/widgets/PreviewPane";
import EmbedCodePane from "metabase/public/components/widgets/EmbedCodePane";
import DisplayOptionsPane from "metabase/public/components/widgets/DisplayOptionsPane";
import { Text } from "metabase/ui";
import { useSelector } from "metabase/lib/redux";
import { getDocsUrl } from "metabase/selectors/settings";
import ExternalLink from "metabase/core/components/ExternalLink";

import type {
  ActivePreviewPane,
  EmbeddingDisplayOptions,
  EmbeddingParameters,
  EmbedResource,
  EmbedResourceType,
  EmbedType,
} from "./EmbeddingModalContent.types";
import { SettingsTabLayout } from "./EmbeddingModalContent.styled";
import { EmbeddingModalContentSection } from "./EmbeddingModalContentSection";

interface EmbeddingModalContentAppearanceSettingsProps {
  activePane: ActivePreviewPane;

  embedType: EmbedType;
  resource: EmbedResource;
  resourceType: EmbedResourceType;
  iframeUrl: string;
  token: string;
  siteUrl: string;
  secretKey: string;
  params: EmbeddingParameters;
  displayOptions: EmbeddingDisplayOptions;

  onChangePane: (pane: ActivePreviewPane) => void;
  onChangeDisplayOptions: (displayOptions: EmbeddingDisplayOptions) => void;
}

export const EmbeddingModalContentAppearanceSettings = ({
  activePane,
  embedType,
  resource,
  resourceType,
  iframeUrl,
  token,
  siteUrl,
  secretKey,
  params,
  displayOptions,

  onChangePane,
  onChangeDisplayOptions,
}: EmbeddingModalContentAppearanceSettingsProps): JSX.Element => {
  const docsUrl = useSelector(state =>
    getDocsUrl(state, { page: "embedding/static-embedding" }),
  );

  const embeddingAppearanceDocsLink = (
    <ExternalLink key="doc" href={docsUrl}>{t`documentation`}</ExternalLink>
  );
  const removeBannerDocsLink = (
    <ExternalLink key="doc" href={docsUrl}>{t`a paid plan`}</ExternalLink>
  );

  return (
    <SettingsTabLayout
      settingsSlot={
        <>
          <EmbeddingModalContentSection
            title={t`Customizing your embed’s appearance`}
          >
            <Text>{jt`These cosmetic options requiring changing the server code. You can play around with and preview the options here, and check out the ${embeddingAppearanceDocsLink} for more.`}</Text>
          </EmbeddingModalContentSection>
          <EmbeddingModalContentSection title={t`Play with the options here`}>
            <DisplayOptionsPane
              className="pt1"
              displayOptions={displayOptions}
              onChangeDisplayOptions={onChangeDisplayOptions}
              // We only show the "Download Data" toggle if the users are pro/enterprise
              // and they're sharing a question metabase#23477
              showDownloadDataButtonVisibilityToggle={
                resourceType === "question"
              }
            />
          </EmbeddingModalContentSection>
          <EmbeddingModalContentSection
            title={t`Removing the “Powered by Metabase” banner`}
          >
            <Text>{jt`This banner appears on all static embeds created with the Metabase open source version. You’ll need to upgrade to ${removeBannerDocsLink} to remove the banner.`}</Text>
          </EmbeddingModalContentSection>
        </>
      }
      previewSlot={
        <>
          <ToggleLarge
            className="mb2 flex-no-shrink"
            style={{ width: 244, height: 34 }}
            value={activePane === "code"}
            textLeft={t`Code`}
            textRight={t`Preview`}
            onChange={() =>
              onChangePane(activePane === "preview" ? "code" : "preview")
            }
          />
          {activePane === "preview" ? (
            <PreviewPane
              className="flex-full"
              previewUrl={iframeUrl}
              isTransparent={displayOptions.theme === "transparent"}
            />
          ) : activePane === "code" ? (
            <EmbedCodePane
              className="flex-full"
              embedType={embedType}
              resource={resource}
              resourceType={resourceType}
              iframeUrl={iframeUrl}
              token={token}
              siteUrl={siteUrl}
              secretKey={secretKey}
              params={params}
              displayOptions={displayOptions}
            />
          ) : null}
        </>
      }
    />
  );
};
