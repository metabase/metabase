import cx from "classnames";
import type React from "react";
import { type ComponentProps, useState } from "react";
import { t } from "ttag";

import {
  UpsellSdkCta,
  useUpsellSdkCta,
} from "metabase/admin/upsells/UpsellSdkCta";
import { UpsellGem } from "metabase/admin/upsells/components";
import ExternalLink from "metabase/common/components/ExternalLink";
import Link from "metabase/common/components/Link";
import { useDocsUrl, useSetting } from "metabase/common/hooks";
import CS from "metabase/css/core/index.css";
import type { ExportFormatType } from "metabase/embedding/components/PublicLinkPopover/types";
import { useSelector } from "metabase/lib/redux";
import { PLUGIN_EMBEDDING } from "metabase/plugins";
import { trackPublicLinkRemoved } from "metabase/public/lib/analytics";
import { getPublicEmbedHTML } from "metabase/public/lib/code";
import type {
  EmbedResource,
  EmbedResourceType,
} from "metabase/public/lib/types";
import { getSetting } from "metabase/selectors/settings";
import { Group, Icon, List, Stack, Text, UnstyledButton } from "metabase/ui";

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
  const { url } = useUpsellSdkCta();
  const hasPublicLink = resource.public_uuid != null;

  const utmTags = {
    utm_content: "embed-modal",
  };

  // eslint-disable-next-line no-unconditional-metabase-links-render -- only visible to admins
  const { url: embeddingUrl } = useDocsUrl("embedding/introduction", {
    anchor: "comparison-of-embedding-types",
    utm: utmTags,
  });

  const isPublicSharingEnabled = useSelector((state) =>
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
      display="inline-flex"
      p="lg"
      gap="lg"
      data-testid="sharing-pane-container"
      align="stretch"
    >
      <Group gap="lg" maw="100%" align="stretch">
        {/* STATIC EMBEDDING*/}
        <SharingPaneButton
          title={t`Static embedding`}
          illustration={<StaticEmbeddingIllustration />}
          onClick={isStaticEmbeddingEnabled ? goToNextStep : undefined}
          isDisabled={!isStaticEmbeddingEnabled}
          disabledLink="/admin/embedding/static"
        >
          <List>
            <List.Item>{t`Embedded, signed charts in iframes.`}</List.Item>
            <List.Item>{t`No query builder or row-level data access.`}</List.Item>
            <List.Item>{t`Data restriction with locked parameters.`}</List.Item>
          </List>
        </SharingPaneButton>

        {/* INTERACTIVE EMBEDDING */}
        <MaybeLinkInteractiveEmbedding
          shouldRenderLink={
            !isInteractiveEmbeddingAvailable || isInteractiveEmbeddingEnabled
          }
        >
          <SharingPaneButton
            title={t`Interactive embedding`}
            badge={<UpsellGem />}
            illustration={<InteractiveEmbeddingIllustration />}
            isDisabled={
              isInteractiveEmbeddingAvailable && !isInteractiveEmbeddingEnabled
            }
            disabledLink={"/admin/embedding/interactive"}
          >
            <List>
              {/* eslint-disable-next-line no-literal-metabase-strings -- only admin sees this */}
              <List.Item>{t`Embed all of Metabase in an iframe.`}</List.Item>
              <List.Item>{t`Let people click to explore.`}</List.Item>
              <List.Item>
                {t`Customize appearance with your logo, font, and colors.`}{" "}
                {!isInteractiveEmbeddingAvailable && <LearnMore url={url} />}
              </List.Item>
            </List>
            {!isInteractiveEmbeddingAvailable && <UpsellSdkCta />}
          </SharingPaneButton>
        </MaybeLinkInteractiveEmbedding>

        {/* REACT SDK */}
        <MaybeLink
          to="/admin/embedding/modular"
          shouldRenderLink={isEmbeddingSdkEnabled}
          aria-label={t`Embedded analytics SDK`}
        >
          <SharingPaneButton
            title={t`Embedded analytics SDK`}
            badge={<UpsellGem />}
            illustration={<SdkIllustration />}
            isDisabled={!isEmbeddingSdkEnabled}
            disabledLink={"/admin/embedding/modular"}
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
      <Group justify="space-between">
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

function LearnMore({ url }: { url: string | undefined }) {
  if (!url) {
    return null;
  }

  return (
    <ExternalLink
      href={url}
      style={{ fontWeight: "bold" }}
    >{t`Learn more`}</ExternalLink>
  );
}

interface MaybeLinkInteractiveEmbeddingProps {
  shouldRenderLink?: boolean;
  children: React.ReactNode;
}

function MaybeLinkInteractiveEmbedding({
  shouldRenderLink,
  ...props
}: MaybeLinkInteractiveEmbeddingProps) {
  const { url, internalLink, triggerUpsellFlow } = useUpsellSdkCta();

  if (!shouldRenderLink) {
    return props.children;
  }

  if (triggerUpsellFlow) {
    return (
      <UnstyledButton
        onClick={triggerUpsellFlow}
        type="button"
        aria-label={t`Interactive embedding`}
      >
        {props.children}
      </UnstyledButton>
    );
  }

  if (url) {
    return (
      <ExternalLink
        {...props}
        href={url}
        target="_blank"
        aria-label={t`Interactive embedding`}
      />
    );
  }

  if (internalLink) {
    return (
      <Link
        {...props}
        to={internalLink}
        aria-label={t`Interactive embedding`}
      />
    );
  }

  return props.children;
}

interface MaybeLinkProps extends ComponentProps<typeof Link> {
  shouldRenderLink?: boolean;
}

function MaybeLink({ shouldRenderLink, ...props }: MaybeLinkProps) {
  if (shouldRenderLink) {
    return <Link {...props} />;
  }

  return props.children;
}
