import cx from "classnames";
import type { MouseEvent } from "react";
import { useState } from "react";
import { jt, t } from "ttag";

import { getPlan } from "metabase/common/utils/plan";
import Link from "metabase/core/components/Link";
import CS from "metabase/css/core/index.css";
import { useSelector } from "metabase/lib/redux";
import { PLUGIN_EMBEDDING } from "metabase/plugins";
import {
  trackPublicEmbedCodeCopied,
  trackPublicLinkRemoved,
} from "metabase/public/lib/analytics";
import { getPublicEmbedHTML } from "metabase/public/lib/code";
import type {
  EmbedResource,
  EmbedResourceType,
} from "metabase/public/lib/types";
import { getSetting } from "metabase/selectors/settings";
import { PublicLinkCopyPanel } from "metabase/sharing/components/PublicLinkPopover/PublicLinkCopyPanel";
import type { ExportFormatType } from "metabase/sharing/components/PublicLinkPopover/types";
import { Box, Button, Group, Icon, List, Stack, Text } from "metabase/ui";

import { SharingPaneButton } from "./SharingPaneButton/SharingPaneButton";
import { SharingPaneActionButton } from "./SharingPaneButton/SharingPaneButton.styled";
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

  // TODO: needs to use this
  const isPublicSharingEnabled = useSelector(state =>
    getSetting(state, "enable-public-sharing"),
  );

  const [isLoadingLink, setIsLoadingLink] = useState(false);

  const publicEmbedCode =
    resource.public_uuid &&
    getPublicEmbedHTML(getPublicUrl(resource.public_uuid));

  const createPublicLink = async (e: MouseEvent) => {
    e.stopPropagation();
    if (!isLoadingLink && !hasPublicLink) {
      setIsLoadingLink(true);
      await onCreatePublicLink();
      setIsLoadingLink(false);
    }
  };

  const deletePublicLink = async (e: MouseEvent) => {
    e.stopPropagation();
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

  const getPublicLinkElement = () => {
    if (isLoadingLink) {
      return (
        <SharingPaneActionButton
          fullWidth
          disabled
        >{t`Loading…`}</SharingPaneActionButton>
      );
    }

    if (hasPublicLink && resource.public_uuid != null) {
      return (
        <PublicLinkCopyPanel
          url={publicEmbedCode}
          onCopy={() =>
            trackPublicEmbedCodeCopied({
              artifact: resourceType,
              source: "public-embed",
            })
          }
          onRemoveLink={deletePublicLink}
          removeButtonLabel={t`Remove public URL`}
          removeTooltipLabel={t`Affects both embed URL and public link for this dashboard`}
        />
      );
    }

    return (
      <SharingPaneActionButton
        fullWidth
        disabled={!isPublicSharingEnabled}
      >{t`Get an embed link`}</SharingPaneActionButton>
    );
  };

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
          onClick={goToNextStep}
        >
          <List>
            <List.Item>{t`Embedded, signed charts in iframes.`}</List.Item>
            <List.Item>{t`No query builder or row-level data access.`}</List.Item>
            <List.Item>{t`Data restriction with locked parameters.`}</List.Item>
          </List>
        </SharingPaneButton>

        {/* INTERACTIVE EMBEDDING */}
        <Link
          to={interactiveEmbeddingCta.url}
          target={interactiveEmbeddingCta.target}
          rel="noreferrer"
          style={{ height: "100%" }}
        >
          <SharingPaneButton
            title={t`Interactive embedding`}
            illustration={<InteractiveEmbeddingIllustration />}
          >
            <List>
              {/* eslint-disable-next-line no-literal-metabase-strings -- only admin sees this */}
              <List.Item>{t`Embed the full Metabase app with iframes.`}</List.Item>
              <List.Item>{t`Settings to customize appearance.`}</List.Item>
              <List.Item>{t`Includes query builder with row-level access.`}</List.Item>
            </List>
          </SharingPaneButton>
        </Link>

        {/* REACT SDK */}
        <a
          href="https://metaba.se/sdk"
          style={{ height: "100%" }}
          target="_blank"
          rel="noreferrer"
        >
          <SharingPaneButton
            title={t`Embedded analytics SDK`}
            badge={<BetaBadge />}
            illustration={<SdkIllustration />}
            externalLink
          >
            <List>
              <List.Item>{t`Full control with React components.`}</List.Item>
              {/* eslint-disable-next-line no-literal-metabase-strings -- only admin sees this */}
              <List.Item>{t`Embed individual components of Metabase.`}</List.Item>
              <List.Item>{t`CSS styling, user flows, usage analytics.`}</List.Item>
              <List.Item>{t`For Pro and Enterprise plans only.`}</List.Item>
            </List>
          </SharingPaneButton>
        </a>
      </Group>
      <Group position="apart">
        {/* PUBLIC EMBEDDING */}
        <PublicEmbedCard
          publicEmbedCode={publicEmbedCode}
          createPublicLink={onCreatePublicLink}
          deletePublicLink={onDeletePublicLink}
        />
        <a
          className={cx(CS.link, CS.textBold)}
          style={{ display: "flex", alignItems: "center", gap: 4 }}
          // eslint-disable-next-line no-unconditional-metabase-links-render -- only visible to admins
          href="https://www.metabase.com/docs/latest/embedding/introduction#comparison-of-embedding-types"
        >
          {t`Compare options`} <Icon name="share" />
        </a>
      </Group>
      {getPublicLinkElement()}
    </Stack>
  );
}

const PublicEmbedCard = ({
  publicEmbedCode,
  createPublicLink,
  deletePublicLink,
}) => {
  return (
    <Group spacing="xs">
      <Text>
        {jt`Use ${(
          <Text span fw="bold">
            {t`public embedding`}
          </Text>
        )} to add a publicly-visible iframe embed to your web page or blog
    post.`}
      </Text>
      <Button
        variant="subtle"
        p={0}
        onClick={() => {
          if (publicEmbedCode) {
            navigator.clipboard.writeText(publicEmbedCode);
          } else {
            alert("No public embed code found");
          }
        }}
      >{t`Get embedding code`}</Button>
    </Group>
  );
};

export const useInteractiveEmbeddingCta = () => {
  const isInteractiveEmbeddingEnabled = useSelector(
    PLUGIN_EMBEDDING.isInteractiveEmbeddingEnabled,
  );
  const plan = useSelector(state =>
    getPlan(getSetting(state, "token-features")),
  );

  // TODO: check if we still need anything else other than url and target
  if (isInteractiveEmbeddingEnabled) {
    return {
      showProBadge: false,
      description: t`Your plan allows you to use Interactive Embedding create interactive embedding experiences with drill-through and more.`,
      linkText: t`Set it up`,
      url: "/admin/settings/embedding-in-other-applications/full-app",
    };
  }

  return {
    showProBadge: true,
    // eslint-disable-next-line no-literal-metabase-strings -- This only shows for admins
    description: t`Give your customers the full power of Metabase in your own app, with SSO, advanced permissions, customization, and more.`,
    linkText: t`Learn more`,
    url: `https://www.metabase.com/product/embedded-analytics?${new URLSearchParams(
      {
        utm_source: "product",
        utm_medium: "upsell",
        utm_campaign: "embedding-interactive",
        utm_content: "static-embed-popover",
        source_plan: plan,
      },
    )}`,
    target: "_blank",
  };
};

const BetaBadge = () => (
  <Box
    display="inline"
    px="2px"
    py="2px"
    bg="var(--mb-base-color-gray-20)"
    style={{ borderRadius: 4 }}
    my="auto"
  >
    <Text
      weight={700}
      style={{ lineHeight: 1 }}
      display="inline"
    >{t`BETA`}</Text>
  </Box>
);
