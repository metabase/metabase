import { t } from "ttag";

import { CopyButton, Icon, Menu, Tooltip } from "metabase/ui";
import type { IconName } from "metabase-types/api";

import { LinkCopiedTooltipLabel } from "../LinkCopiedTooltipLabel";

// how long the copied-confirmation feedback stays visible
export const COPY_TIMEOUT_MS = 2000;

function CopyMenuItem({
  url,
  icon,
  label,
  copiedMessage,
  onCopied,
}: {
  url: string;
  icon: IconName;
  label: string;
  copiedMessage: string;
  onCopied?: () => void;
}) {
  return (
    <CopyButton value={url} timeout={COPY_TIMEOUT_MS}>
      {({ copied, copy }) => (
        <Tooltip
          label={<LinkCopiedTooltipLabel message={copiedMessage} />}
          opened={copied}
        >
          <Menu.Item
            leftSection={<Icon name={icon} aria-hidden />}
            closeMenuOnClick={false}
            onClick={() => {
              copy();
              onCopied?.();
            }}
          >
            {label}
          </Menu.Item>
        </Tooltip>
      )}
    </CopyButton>
  );
}

export function CopyLinkMenuItem({ url }: { url: string }) {
  return (
    <CopyMenuItem
      url={url}
      icon="link"
      label={t`Copy link`}
      copiedMessage={t`Link copied to clipboard`}
    />
  );
}

export function CopyPublicLinkMenuItem({
  url,
  onCopied,
}: {
  url: string;
  onCopied?: () => void;
}) {
  return (
    <CopyMenuItem
      url={url}
      icon="globe"
      label={t`Copy public link`}
      copiedMessage={t`Public link copied to clipboard`}
      onCopied={onCopied}
    />
  );
}
