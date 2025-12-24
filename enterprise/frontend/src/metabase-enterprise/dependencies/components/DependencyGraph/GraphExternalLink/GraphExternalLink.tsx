import { ForwardRefLink } from "metabase/common/components/Link";
import { ActionIcon, FixedSizeIcon, Tooltip, rem } from "metabase/ui";

import { ACTION_ICON_PADDING, TOOLTIP_OPEN_DELAY } from "../constants";

type GraphExternalLinkProps = {
  label: string;
  url: string;
};

export function GraphExternalLink({ label, url }: GraphExternalLinkProps) {
  return (
    <Tooltip label={label} openDelay={TOOLTIP_OPEN_DELAY}>
      <ActionIcon
        component={ForwardRefLink}
        to={url}
        // target="_blank"
        m={rem(-ACTION_ICON_PADDING)}
        aria-label={label}
      >
        <FixedSizeIcon name="external" />
      </ActionIcon>
    </Tooltip>
  );
}
