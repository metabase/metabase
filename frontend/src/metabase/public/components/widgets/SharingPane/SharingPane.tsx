import { t } from "ttag";
import type { Card, Dashboard } from "metabase-types/api";
import { PublicLinkCopyPanel } from "metabase/dashboard/components/PublicLinkPopover/PublicLinkCopyPanel";
import { useSelector } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";
import { SharingPaneButton } from "metabase/public/components/widgets/SharingPane/SharingPaneButton/SharingPaneButton";
import { SharingPaneActionButton } from "metabase/public/components/widgets/SharingPane/SharingPaneButton/SharingPaneButton.styled";
import { Group, Text, Anchor, Box } from "metabase/ui";

import { getPublicEmbedHTML } from "metabase/public/lib/code";

import * as MetabaseAnalytics from "metabase/lib/analytics";
import Link from "metabase/core/components/Link";
import { PublicEmbedIcon, StaticEmbedIcon } from "./icons";

export type Resource = Dashboard | Card;

type ExportFormatType = string | null;

interface SharingPaneProps {
  resource: Resource;
  resourceType: string;
  onCreatePublicLink: () => void;
  onDeletePublicLink: () => void;
  getPublicUrl: (resource: Resource, extension?: ExportFormatType) => void;
  onChangeEmbedType: (embedType: string) => void;
  isPublicSharingEnabled: boolean;
}

function SharingPane({
  resource,
  resourceType,
  onCreatePublicLink,
  onDeletePublicLink,
  getPublicUrl,
  onChangeEmbedType,
}: SharingPaneProps) {
  const iframeSource = getPublicEmbedHTML(getPublicUrl(resource));

  const hasPublicLink = !!resource.public_uuid;

  const isPublicSharingEnabled = useSelector(state =>
    getSetting(state, "enable-public-sharing"),
  );

  const createPublicLink = () => {
    MetabaseAnalytics.trackStructEvent(
      "Sharing Modal",
      "Public Link Enabled",
      resourceType,
    );
    onCreatePublicLink();
  };

  const deletePublicLink = () => {
    MetabaseAnalytics.trackStructEvent(
      "Sharing Modal",
      "Public Link Disabled",
      resourceType,
    );
    onDeletePublicLink();
  };

  const publicLinkInfoText = hasPublicLink ? (
    //   TextInput has a hardcoded marginTop that we need to account for here.
    <Box mb="-0.25rem">{t`Just copy this snippet to add a publicly-visible iframe embed to your web page or blog post.`}</Box>
  ) : (
    t`Use this to add a publicly-visible iframe embed to your web page or blog post.`
  );

  return (
    <Group p="lg" data-testid="sharing-pane-container">
      <SharingPaneButton
        header={t`Static embed`}
        description={t`Securely embed this dashboard in your own application’s server code.`}
        illustration={<StaticEmbedIcon />}
        onClick={() => onChangeEmbedType("application")}
      >
        <SharingPaneActionButton
          data-testid="sharing-pane-static-embed-button"
          fullWidth
          onClick={() => onChangeEmbedType("application")}
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
              <Link to="/admin/settings/public-sharing">
                <Anchor data-testid="sharing-pane-settings-link">{t`Settings`}</Anchor>
              </Link>
            </Text>
          )
        }
        disabled={!isPublicSharingEnabled}
        onClick={createPublicLink}
        illustration={<PublicEmbedIcon disabled={!isPublicSharingEnabled} />}
      >
        {resource.public_uuid ? (
          <PublicLinkCopyPanel
            url={iframeSource}
            onRemoveLink={deletePublicLink}
            removeButtonLabel={t`Remove public URL`}
            removeTooltipLabel={t`Affects both embed URL and public link for this dashboard`}
          />
        ) : (
          <SharingPaneActionButton
            fullWidth
            disabled={!isPublicSharingEnabled}
            onClick={createPublicLink}
          >{t`Get an embed link`}</SharingPaneActionButton>
        )}
      </SharingPaneButton>
    </Group>
  );
}

export { SharingPane };
