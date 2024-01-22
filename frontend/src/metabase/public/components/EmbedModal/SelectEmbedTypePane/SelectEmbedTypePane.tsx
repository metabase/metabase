import type { MouseEvent } from "react";
import { useState } from "react";
import { t } from "ttag";
import { PublicLinkCopyPanel } from "metabase/dashboard/components/PublicLinkPopover/PublicLinkCopyPanel";
import { useSelector } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";
import { Group, Text, Anchor, Stack } from "metabase/ui";
import { getPublicEmbedHTML } from "metabase/public/lib/code";
import * as MetabaseAnalytics from "metabase/lib/analytics";
import Link from "metabase/core/components/Link";
import type { ExportFormatType } from "metabase/dashboard/components/PublicLinkPopover/types";

import type { EmbedResource, EmbedResourceType } from "../types";
import { SharingPaneActionButton } from "./SharingPaneButton/SharingPaneButton.styled";
import { SharingPaneButton } from "./SharingPaneButton/SharingPaneButton";
import { PublicEmbedIcon, StaticEmbedIcon } from "./icons";
import { InteractiveEmbeddingCTA } from "./InteractiveEmbeddingCTA";

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

  const isPublicSharingEnabled = useSelector(state =>
    getSetting(state, "enable-public-sharing"),
  );

  const [isLoadingLink, setIsLoadingLink] = useState(false);

  const createPublicLink = async (e: MouseEvent) => {
    e.stopPropagation();
    if (!isLoadingLink && !hasPublicLink) {
      setIsLoadingLink(true);
      MetabaseAnalytics.trackStructEvent(
        "Sharing Modal",
        "Public Link Enabled",
        resourceType,
      );
      await onCreatePublicLink();
      setIsLoadingLink(false);
    }
  };

  const deletePublicLink = async (e: MouseEvent) => {
    e.stopPropagation();
    if (!isLoadingLink && hasPublicLink) {
      setIsLoadingLink(true);
      MetabaseAnalytics.trackStructEvent(
        "Sharing Modal",
        "Public Link Disabled",
        resourceType,
      );
      await onDeletePublicLink();
      setIsLoadingLink(false);
    }
  };

  const publicLinkInfoText =
    !isLoadingLink && hasPublicLink
      ? //   TextInput has a hardcoded marginTop that we need to account for here.
        t`Just copy this snippet to add a publicly-visible iframe embed to your web page or blog post.`
      : t`Use this to add a publicly-visible iframe embed to your web page or blog post.`;

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
      const iframeSource = getPublicEmbedHTML(
        getPublicUrl(resource.public_uuid),
      );

      return (
        <PublicLinkCopyPanel
          url={iframeSource}
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
    <Stack p="lg" spacing="lg" data-testid="sharing-pane-container">
      <Group spacing="lg">
        <SharingPaneButton
          header={t`Static embed`}
          description={t`Securely embed this dashboard in your own application’s server code.`}
          illustration={<StaticEmbedIcon />}
          onClick={goToNextStep}
        >
          <SharingPaneActionButton
            data-testid="sharing-pane-static-embed-button"
            fullWidth
          >
            {resource.enable_embedding ? t`Edit settings` : t`Set this up`}
          </SharingPaneActionButton>
        </SharingPaneButton>

        <SharingPaneButton
          header={t`Public embed`}
          description={
            isPublicSharingEnabled ? (
              publicLinkInfoText
            ) : (
              <Text>
                {t`Public embeds and links are disabled.`}{" "}
                <Anchor
                  component={Link}
                  to="/admin/settings/public-sharing"
                  data-testid="sharing-pane-settings-link"
                >{t`Settings`}</Anchor>
              </Text>
            )
          }
          disabled={!isPublicSharingEnabled}
          onClick={createPublicLink}
          illustration={<PublicEmbedIcon disabled={!isPublicSharingEnabled} />}
        >
          {getPublicLinkElement()}
        </SharingPaneButton>
      </Group>
      <InteractiveEmbeddingCTA />
    </Stack>
  );
}
