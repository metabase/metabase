import { ForwardRefLink } from "metabase/common/components/Link";
import { ActionIcon, FixedSizeIcon, Tooltip } from "metabase/ui";

import { TOOLTIP_OPEN_DELAY_MS } from "../../../constants";

type GraphExternalLinkProps = {
  label: string;
  url: string;
};

export function GraphExternalLink({ label, url }: GraphExternalLinkProps) {
  return (
    <Tooltip label={label} openDelay={TOOLTIP_OPEN_DELAY_MS}>
      <ActionIcon
        component={ForwardRefLink}
        to={url}
        target="_blank"
        m="-sm"
        aria-label={label}
      >
        <FixedSizeIcon name="external" />
      </ActionIcon>
    </Tooltip>
  );
}
