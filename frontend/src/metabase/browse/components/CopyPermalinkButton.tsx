import type { MouseEvent } from "react";
import { t } from "ttag";

import { ActionIcon, CopyButton, Icon, Tooltip } from "metabase/ui";
import { getWithSiteUrl } from "metabase/utils/dom";

const COPY_TIMEOUT_MS = 2000;

export const CopyPermalinkButton = ({ url }: { url: string }) => {
  const absoluteUrl = getWithSiteUrl(url);

  return (
    <CopyButton value={absoluteUrl} timeout={COPY_TIMEOUT_MS}>
      {({ copied, copy }) => (
        <Tooltip label={copied ? t`Copied!` : t`Copy permalink`}>
          <ActionIcon
            size="sm"
            color="text-secondary"
            aria-label={t`Copy permalink`}
            onClick={(event: MouseEvent) => {
              event.preventDefault();
              event.stopPropagation();
              copy();
            }}
          >
            <Icon name="link" />
          </ActionIcon>
        </Tooltip>
      )}
    </CopyButton>
  );
};
