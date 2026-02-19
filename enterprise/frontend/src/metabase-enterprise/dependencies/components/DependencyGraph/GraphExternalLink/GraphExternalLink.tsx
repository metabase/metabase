import { useContext } from "react";

import { ForwardRefLink } from "metabase/common/components/Link";
import { ActionIcon, FixedSizeIcon, Tooltip } from "metabase/ui";

import { TOOLTIP_OPEN_DELAY_MS } from "../../../constants";
import { GraphContext } from "../GraphContext";

type GraphExternalLinkProps = {
  label: string;
  url: string;
};

export function GraphExternalLink({ label, url }: GraphExternalLinkProps) {
  const { openLinksInNewTab } = useContext(GraphContext);

  return (
    <Tooltip label={label} openDelay={TOOLTIP_OPEN_DELAY_MS}>
      <ActionIcon
        component={ForwardRefLink}
        to={url}
        target={openLinksInNewTab ? "_blank" : undefined}
        m="-sm"
        aria-label={label}
      >
        <FixedSizeIcon name="external" />
      </ActionIcon>
    </Tooltip>
  );
}
