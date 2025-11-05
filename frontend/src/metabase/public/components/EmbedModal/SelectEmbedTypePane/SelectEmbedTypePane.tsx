import cx from "classnames";
import type React from "react";
import { useState } from "react";
import { t } from "ttag";

import {
  UpsellEmbedJsCta,
  useUpsellEmbedJsCta,
} from "metabase/admin/upsells/UpsellEmbedJsCta";
import { UpsellGem } from "metabase/admin/upsells/components";
import ExternalLink from "metabase/common/components/ExternalLink";
import Link from "metabase/common/components/Link";
import {
  useDocsUrl,
  useHasTokenFeature,
  useSetting,
} from "metabase/common/hooks";
import CS from "metabase/css/core/index.css";
import type { ExportFormatType } from "metabase/embedding/components/PublicLinkPopover/types";
import { useSelector } from "metabase/lib/redux";
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
import EmbeddedJsIllustration from "./illustrations/embedded-analytics-js.svg?component";
import SdkIllustration from "./illustrations/embedding-sdk.svg?component";
import StaticEmbeddingIllustration from "./illustrations/static-embedding.svg?component";

interface SelectEmbedTypePaneProps {
  resource: EmbedResource;
  resourceType: EmbedResourceType;
  onCreatePublicLink: () => void;
  onDeletePublicLink: () => void;
  getPublicUrl: (publicUuid: string, extension?: ExportFormatType) => string;
  goToNextStep: () => void;
  closeModal: () => void;
}

export function SelectEmbedTypePane({
  resource,
  resourceType,
  onCreatePublicLink,
  onDeletePublicLink,
  getPublicUrl,
  goToNextStep,
  closeModal,
}: SelectEmbedTypePaneProps) {
  const { url } = useUpsellEmbedJsCta({ resource, resourceType, closeModal });
  const hasPublicLink = resource.public_uuid != null;

  const utmTags = {
    utm_content: "embed-modal",
  };

  // eslint-disable-next-line no-unconditional-metabase-links-render -- only visible to admins
  const { url: embeddingUrl } = useDocsUrl("embedding/introduction", {
    anchor: "comparison-of-embedding-types",
    utm: utmTags,
  });

  // eslint-disable-next-line no-unconditional-metabase-links-render -- only visible to admins
  const { url: sdkDocsUrl } = useDocsUrl("embedding/sdk/introduction", {
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

  const isEmbedJsAvailable = useHasTokenFeature("embedding_simple");
  const isEmbeddingSdkAvailable = useHasTokenFeature("embedding_sdk");
  const isStaticEmbeddingEnabled = useSetting("enable-embedding-static");
  const isEmbedJsEnabled = useSetting("enable-embedding-simple");
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
        {/* Static Embedding */}
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

        {/* Embedded Analytics JS: render either upsell or embed flow link */}
        <MaybeLinkEmbedJs
          resource={resource}
          resourceType={resourceType}
          shouldRenderLink={!isEmbedJsAvailable || isEmbedJsEnabled}
          closeModal={closeModal}
        >
          <SharingPaneButton
            title={t`Embedded Analytics JS`}
            badge={!isEmbedJsAvailable && <UpsellGem />}
            illustration={<EmbeddedJsIllustration />}
            isDisabled={isEmbedJsAvailable && !isEmbedJsEnabled}
            disabledLink="/admin/embedding/modular"
            actionHint={
              !isEmbedJsAvailable ? (
                <UpsellEmbedJsCta
                  resource={resource}
                  resourceType={resourceType}
                  closeModal={closeModal}
                />
              ) : undefined
            }
          >
            <List>
              <List.Item>{t`A simple way to embed using plain JavaScript`}</List.Item>
              <List.Item>{t`Embed static or interactive dashboards and charts with drill-down, the query builder or let people browse and manage collections.`}</List.Item>
              <List.Item>
                {t`Advanced customizations for styling.`} <br />{" "}
                {!isEmbedJsAvailable && <LearnMore url={url} />}
              </List.Item>
            </List>
          </SharingPaneButton>
        </MaybeLinkEmbedJs>

        {/* SDK for React */}
        <ExternalLink href={sdkDocsUrl} className={CS.noDecoration}>
          <SharingPaneButton
            title={t`SDK for React`}
            badge={!isEmbeddingSdkAvailable && <UpsellGem />}
            illustration={<SdkIllustration />}
            isDisabled={!isEmbeddingSdkEnabled}
            disabledLink={"/admin/embedding/modular"}
            actionHint={
              <Group gap="xs">
                <Text c="brand" fw="bold">
                  {t`Go to quick start`}
                </Text>

                <Icon name="external" c="brand" aria-hidden />
              </Group>
            }
          >
            <List>
              {/* eslint-disable-next-line no-literal-metabase-strings -- visible only to admin */}
              <List.Item>{t`Embed Metabase components with React (like standalone charts, dashboards, the query builder, and more)`}</List.Item>
              <List.Item>{t`Manage access and interactivity per component`}</List.Item>
              <List.Item>{t`Advanced customization options for styling`}</List.Item>
            </List>
          </SharingPaneButton>
        </ExternalLink>
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

function MaybeLinkEmbedJs({
  resource,
  resourceType,
  shouldRenderLink,
  closeModal,
  ...props
}: {
  children: React.ReactNode;
  resource: EmbedResource;
  resourceType: EmbedResourceType;
  shouldRenderLink?: boolean;
  closeModal: () => void;
}) {
  const { openEmbedFlow, url, triggerUpsellFlow } = useUpsellEmbedJsCta({
    resource,
    resourceType,
    closeModal,
  });

  if (!shouldRenderLink) {
    return props.children;
  }

  if (openEmbedFlow || triggerUpsellFlow) {
    return (
      <UnstyledButton
        onClick={() => {
          if (triggerUpsellFlow) {
            triggerUpsellFlow();
          } else if (openEmbedFlow) {
            openEmbedFlow();
          }
        }}
        type="button"
        aria-label={t`Embedded Analytics JS`}
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
        aria-label={t`Embedded Analytics JS`}
      />
    );
  }

  return props.children;
}
