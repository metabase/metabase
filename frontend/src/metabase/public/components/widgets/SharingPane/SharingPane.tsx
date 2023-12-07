import { useCallback } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";
import type { Card, Dashboard } from "metabase-types/api";
import { PublicLinkCopyPanel } from "metabase/dashboard/components/PublicLinkPopover/PublicLinkCopyPanel";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";
import { PublicEmbedIcon } from "metabase/public/components/widgets/SharingPane/icons/PublicEmbedIcon/PublicEmbedIcon";
import { StaticEmbedIcon } from "metabase/public/components/widgets/SharingPane/icons/StaticEmbedIcon/StaticEmbedIcon";
import { SharingPaneButton } from "metabase/public/components/widgets/SharingPane/SharingPaneButton/SharingPaneButton";
import { SharingPaneActionButton } from "metabase/public/components/widgets/SharingPane/SharingPaneButton/SharingPaneButton.styled";
import { Group, Text, Anchor } from "metabase/ui";

import { getPublicEmbedHTML } from "metabase/public/lib/code";

import * as MetabaseAnalytics from "metabase/lib/analytics";

export type Resource = Dashboard | Card;

type ExportFormatType = string | null;

interface SharingPaneProps {
  resource: Resource;
  resourceType: string;
  onCreatePublicLink: () => void;
  onDisablePublicLink: () => void;
  extensions: ExportFormatType[];
  getPublicUrl: (resource: Resource, extension?: ExportFormatType) => void;
  onChangeEmbedType: (embedType: string) => void;
  isPublicSharingEnabled: boolean;
}

function SharingPane({
  resource,
  resourceType,
  onCreatePublicLink,
  onDisablePublicLink,
  getPublicUrl,
  onChangeEmbedType,
}: SharingPaneProps) {
  const iframeSource = getPublicEmbedHTML(getPublicUrl(resource));

  const hasPublicLink = !!resource.public_uuid;

  const isPublicSharingEnabled = useSelector(state =>
    getSetting(state, "enable-public-sharing"),
  );

  const dispatch = useDispatch();

  const onChangeLocation = useCallback(
    () => dispatch(push("/admin/settings/public-sharing")),
    [dispatch],
  );

  const createPublicLink = () => {
    MetabaseAnalytics.trackStructEvent(
      "Sharing Modal",
      "Public Link Enabled",
      resourceType,
    );
    onCreatePublicLink();
  };

  const disablePublicLink = () => {
    MetabaseAnalytics.trackStructEvent(
      "Sharing Modal",
      "Public Link Disabled",
      resourceType,
    );
    onDisablePublicLink();
  };

  return (
    <Group p="lg">
      <SharingPaneButton
        header={t`Static embed`}
        description={t`Securely embed this dashboard in your own application’s server code.`}
        illustration={StaticEmbedIcon}
      >
        <SharingPaneActionButton
          fullWidth
          onClick={() => onChangeEmbedType("application")}
        >
          {resource.enable_embedding ? t`Edit settings` : t`Set this up`}
        </SharingPaneActionButton>
      </SharingPaneButton>

      <SharingPaneButton
        header={t`Public embed`}
        disabled={!isPublicSharingEnabled}
        description={
          isPublicSharingEnabled ? (
            hasPublicLink ? (
              t`Just copy this snippet to add a publicly-visible iframe embed to your web page or blog post.`
            ) : (
              t`Use this to add a publicly-visible iframe embed to your web page or blog post.`
            )
          ) : (
            <>
              <Text>
                {t`Public embeds and links are disabled.`}{" "}
                <Anchor
                  data-testid="sharing-pane-settings-link"
                  onClick={onChangeLocation}
                >{t`Settings`}</Anchor>
              </Text>
            </>
          )
        }
        illustration={PublicEmbedIcon}
      >
        {resource.public_uuid ? (
          <PublicLinkCopyPanel
            url={iframeSource}
            onRemoveLink={disablePublicLink}
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
