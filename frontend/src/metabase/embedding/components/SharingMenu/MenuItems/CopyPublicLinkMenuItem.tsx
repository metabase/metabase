import { t } from "ttag";

import { CopyButton, Icon, Menu, Tooltip } from "metabase/ui";

import {
  COPY_TIMEOUT_MS,
  LinkCopiedTooltipLabel,
} from "../LinkCopiedTooltipLabel";

export function CopyPublicLinkMenuItem({
  url,
  onCopied,
}: {
  url: string;
  onCopied?: () => void;
}) {
  return (
    <CopyButton value={url} timeout={COPY_TIMEOUT_MS}>
      {({ copied, copy }) => (
        <Tooltip
          label={
            <LinkCopiedTooltipLabel
              message={t`Public link copied to clipboard`}
            />
          }
          opened={copied}
        >
          <Menu.Item
            leftSection={<Icon name="globe" aria-hidden />}
            closeMenuOnClick={false}
            onClick={() => {
              copy();
              onCopied?.();
            }}
          >
            {t`Copy public link`}
          </Menu.Item>
        </Tooltip>
      )}
    </CopyButton>
  );
}
