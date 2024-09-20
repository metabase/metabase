import cx from "classnames";
import { useState } from "react";
import { useAsync } from "react-use";
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
import {
  Box,
  Button,
  Center,
  Group,
  Icon,
  List,
  Loader,
  Popover,
  Stack,
  Text,
} from "metabase/ui";

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

  const plan = useSelector(state =>
    getPlan(getSetting(state, "token-features")),
  );

  const utmTags = `?utm_source=product&source_plan=${plan}&utm_content=embed-modal`;

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
          href={"https://metaba.se/sdk" + utmTags}
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
        <a
          className={cx(CS.link, CS.textBold)}
          style={{ display: "flex", alignItems: "center", gap: 4 }}
          href={
            // eslint-disable-next-line no-unconditional-metabase-links-render -- only visible to admins
            "https://www.metabase.com/docs/latest/embedding/introduction#comparison-of-embedding-types" +
            utmTags
          }
        >
          {t`Compare options`} <Icon name="share" />
        </a>
      </Group>
    </Stack>
  );
}

const PublicEmbedCard = ({
  publicEmbedCode,
  createPublicLink,
  deletePublicLink,
  resourceType,
}: any) => {
  const [isOpen, setIsOpen] = useState(false);

  const { loading } = useAsync(async () => {
    if (isOpen && !publicEmbedCode) {
      return createPublicLink();
    }
    return null;
  }, [publicEmbedCode, isOpen]);

  return (
    <Group spacing="xs">
      <Text>
        {jt`Use ${(
          <Text span fw="bold" key="bold">
            {t`public embedding`}
          </Text>
        )} to add a publicly-visible iframe embed to your web page or blog
    post.`}
      </Text>
      <Popover
        width={200}
        position="bottom"
        withArrow
        shadow="md"
        opened={isOpen}
      >
        <Popover.Target>
          <Button
            variant="subtle"
            p={0}
            onClick={() => setIsOpen(value => !value)}
          >{t`Get embedding code`}</Button>
        </Popover.Target>
        <Popover.Dropdown>
          <Stack p="lg" w="28rem" mih="7.5rem" justify="center">
            {loading ? (
              <Center>
                <Loader />
              </Center>
            ) : (
              <PublicLinkCopyPanel
                url={publicEmbedCode}
                onRemoveLink={e => {
                  setIsOpen(false);
                  deletePublicLink(e);
                }}
                removeButtonLabel={t`Remove public link`}
                removeTooltipLabel={t`Affects both public link and embed URL for this dashboard`}
                onCopy={() =>
                  trackPublicEmbedCodeCopied({
                    artifact: resourceType,
                    source: "public-embed",
                  })
                }
              />
            )}
          </Stack>
        </Popover.Dropdown>
      </Popover>
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

  if (isInteractiveEmbeddingEnabled) {
    return {
      url: "/admin/settings/embedding-in-other-applications/full-app",
    };
  }

  return {
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
