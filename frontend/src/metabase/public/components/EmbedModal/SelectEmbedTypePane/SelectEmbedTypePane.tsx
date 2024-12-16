import cx from "classnames";
import { type ComponentProps, useState } from "react";
import { t } from "ttag";

import { useDocsUrl, useSetting, useUrlWithUtm } from "metabase/common/hooks";
import ExternalLink from "metabase/core/components/ExternalLink";
import Link from "metabase/core/components/Link";
import CS from "metabase/css/core/index.css";
import { Badge } from "metabase/home/components/EmbedHomepage/Badge";
import { useSelector } from "metabase/lib/redux";
import { PLUGIN_EMBEDDING } from "metabase/plugins";
import { trackPublicLinkRemoved } from "metabase/public/lib/analytics";
import { getPublicEmbedHTML } from "metabase/public/lib/code";
import type {
  EmbedResource,
  EmbedResourceType,
} from "metabase/public/lib/types";
import { getSetting } from "metabase/selectors/settings";
import type { ExportFormatType } from "metabase/sharing/components/PublicLinkPopover/types";
import { Flex, Group, Icon, List, Stack, Text } from "metabase/ui";

import { PublicEmbedCard } from "./PublicEmbedCard";
import { SharingPaneButton } from "./SharingPaneButton/SharingPaneButton";
import SdkIllustration from "./illustrations/embedding-sdk.svg?component";
import InteractiveEmbeddingIllustration from "./illustrations/interactive-embedding.svg?component";
import StaticEmbeddingIllustration from "./illustrations/static-embedding.svg?component";

interface SelectEmbedTypePaneProps {
  resource: EmbedResource;
  resourceType: EmbedResourceType;
  onCreatePublicLink: () => void;
  onDeletePublicLink: () => void;
  getPublicUrl: (publicUuid: string, extension?: ExportFormatType) => string;
  goToNextStep: () => void;
}

export function SelectEmbedTypePane({
  resource,
  resourceType,
  onCreatePublicLink,
  onDeletePublicLink,
  getPublicUrl,
  goToNextStep,
}: SelectEmbedTypePaneProps) {
  const hasPublicLink = resource.public_uuid != null;

  const interactiveEmbeddingCta = useInteractiveEmbeddingCta();

  const utmTags = {
    utm_content: "embed-modal",
  };

  // eslint-disable-next-line no-unconditional-metabase-links-render -- only visible to admins
  const { url: embeddingUrl } = useDocsUrl("embedding/introduction", {
    anchor: "comparison-of-embedding-types",
    utm: utmTags,
  });

  const isPublicSharingEnabled = useSelector(state =>
    getSetting(state, "enable-public-sharing"),
  );

  const [isLoadingLink, setIsLoadingLink] = useState(false);

  const publicEmbedCode =
    resource.public_uuid &&
    getPublicEmbedHTML(getPublicUrl(resource.public_uuid));

  const createPublicLink = async () => {
    if (!isLoadingLink && !hasPublicLink) {
      setIsLoadingLink(true);
      await onCreatePublicLink();
      setIsLoadingLink(false);
    }
  };

  const deletePublicLink = async () => {
    if (!isLoadingLink && hasPublicLink) {
      setIsLoadingLink(true);

      trackPublicLinkRemoved({
        artifact: resourceType,
        source: "public-embed",
      });

      await onDeletePublicLink();
      setIsLoadingLink(false);
    }
  };

  const isInteractiveEmbeddingAvailable = useSelector(
    PLUGIN_EMBEDDING.isInteractiveEmbeddingEnabled,
  );
  const isStaticEmbeddingEnabled = useSetting("enable-embedding-static");
  const isInteractiveEmbeddingEnabled = useSetting(
    "enable-embedding-interactive",
  );
  const isEmbeddingSdkEnabled = useSetting("enable-embedding-sdk");

  return (
    <Stack
      display={"inline-flex"}
      p="lg"
      spacing="lg"
      data-testid="sharing-pane-container"
      align="stretch"
    >
      <Group spacing="lg" maw="100%" align="stretch">
        {/* STATIC EMBEDDING*/}
        <SharingPaneButton
          title={t`Static embedding`}
          illustration={<StaticEmbeddingIllustration />}
          onClick={isStaticEmbeddingEnabled ? goToNextStep : undefined}
          isDisabled={!isStaticEmbeddingEnabled}
          disabledLink="/admin/settings/embedding-in-other-applications/standalone"
        >
          <List>
            <List.Item>{t`Embedded, signed charts in iframes.`}</List.Item>
            <List.Item>{t`No query builder or row-level data access.`}</List.Item>
            <List.Item>{t`Data restriction with locked parameters.`}</List.Item>
          </List>
        </SharingPaneButton>

        {/* INTERACTIVE EMBEDDING */}
        <MaybeLink
          to={interactiveEmbeddingCta.url}
          target={interactiveEmbeddingCta.target}
          rel="noreferrer"
          shouldRenderLink={
            !isInteractiveEmbeddingAvailable || isInteractiveEmbeddingEnabled
          }
          aria-label={t`Interactive embedding`}
        >
          <SharingPaneButton
            title={t`Interactive embedding`}
            badge={<Badge color="brand">{t`Pro`}</Badge>}
            illustration={<InteractiveEmbeddingIllustration />}
            isDisabled={
              isInteractiveEmbeddingAvailable && !isInteractiveEmbeddingEnabled
            }
            disabledLink={
              "/admin/settings/embedding-in-other-applications/full-app"
            }
          >
            <List>
              {/* eslint-disable-next-line no-literal-metabase-strings -- only admin sees this */}
              <List.Item>{t`Embed all of Metabase in an iframe.`}</List.Item>
              <List.Item>{t`Let people can click on to explore.`}</List.Item>
              <List.Item>{t`Customize appearance with your logo, font, and colors.`}</List.Item>
            </List>
            {!isInteractiveEmbeddingAvailable && (
              <ExternalLink>
                <Flex align="center">
                  {t`Learn more`}
                  <Icon name="share" ml="xs" />
                </Flex>
              </ExternalLink>
            )}
          </SharingPaneButton>
        </MaybeLink>

        {/* REACT SDK */}
        <MaybeLink
          to="/admin/settings/embedding-in-other-applications/sdk"
          shouldRenderLink={isEmbeddingSdkEnabled}
          aria-label={t`Embedded analytics SDK`}
        >
          <SharingPaneButton
            title={t`Embedded analytics SDK`}
            badge={
              <>
                <Badge color="gray">{t`Beta`}</Badge>
                <Badge color="brand">{t`Pro`}</Badge>
              </>
            }
            illustration={<SdkIllustration />}
            isDisabled={!isEmbeddingSdkEnabled}
            disabledLink={"/admin/settings/embedding-in-other-applications/sdk"}
          >
            <List>
              {/* eslint-disable-next-line no-literal-metabase-strings -- visible only to admin */}
              <List.Item>{t`Embed Metabase components with React (like standalone charts, dashboards, the Query Builder, and more)`}</List.Item>
              <List.Item>{t`Manage access and interactivity per component`}</List.Item>
              <List.Item>{t`Advanced customization options for styling`}</List.Item>
            </List>
          </SharingPaneButton>
        </MaybeLink>
      </Group>
      <Group position="apart">
        {/* PUBLIC EMBEDDING */}
        {isPublicSharingEnabled ? (
          <PublicEmbedCard
            publicEmbedCode={publicEmbedCode}
            createPublicLink={createPublicLink}
            deletePublicLink={deletePublicLink}
            resourceType={resourceType}
          />
        ) : (
          <Text>
            {t`Public embeds and links are disabled.`}{" "}
            <Link
              variant="brand"
              to="/admin/settings/public-sharing"
            >{t`Settings`}</Link>
          </Text>
        )}
        <ExternalLink
          className={cx(CS.link, CS.textBold)}
          style={{ display: "flex", alignItems: "center", gap: 4 }}
          href={embeddingUrl}
        >
          {t`Compare options`} <Icon name="share" aria-hidden />
        </ExternalLink>
      </Group>
    </Stack>
  );
}

export const useInteractiveEmbeddingCta = () => {
  const isInteractiveEmbeddingEnabled = useSelector(
    PLUGIN_EMBEDDING.isInteractiveEmbeddingEnabled,
  );

  const url = useUrlWithUtm(
    `https://www.metabase.com/product/embedded-analytics`,
    {
      utm_source: "product",
      utm_medium: "upsell",
      utm_campaign: "embedding-interactive",
      utm_content: "static-embed-popover",
    },
  );

  if (isInteractiveEmbeddingEnabled) {
    return {
      url: "/admin/settings/embedding-in-other-applications/full-app",
    };
  }

  return {
    url,
    target: "_blank",
  };
};

interface MaybeLinkProps extends ComponentProps<typeof Link> {
  shouldRenderLink?: boolean;
}
function MaybeLink({ shouldRenderLink, ...props }: MaybeLinkProps) {
  if (shouldRenderLink) {
    return <Link {...props} />;
  }

  return props.children;
}
