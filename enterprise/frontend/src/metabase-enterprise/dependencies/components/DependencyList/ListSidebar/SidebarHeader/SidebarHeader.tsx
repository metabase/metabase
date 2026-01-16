import cx from "classnames";
import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import CS from "metabase/css/core/index.css";
import * as Urls from "metabase/lib/urls";
import { ActionIcon, Anchor, FixedSizeIcon, Group, Tooltip } from "metabase/ui";
import type { DependencyNode } from "metabase-types/api";

import { TOOLTIP_OPEN_DELAY_MS } from "../../../../constants";
import { getNodeLabel, getNodeLink } from "../../../../utils";

import S from "./SidebarHeader.module.css";

type SidebarHeaderProps = {
  node: DependencyNode;
  onClose: () => void;
};

export function SidebarHeader({ node, onClose }: SidebarHeaderProps) {
  const link = getNodeLink(node);

  return (
    <Group
      gap="0.75rem"
      wrap="nowrap"
      align="start"
      justify="space-between"
      data-testid="dependency-list-sidebar-header"
    >
      <Anchor
        className={cx(CS.textWrap, S.link)}
        component={ForwardRefLink}
        fz="h3"
        fw="bold"
        lh="h3"
        to={link?.url ?? ""}
        target="_blank"
      >
        {getNodeLabel(node)}
      </Anchor>
      <Group gap="sm">
        <Tooltip
          label={t`Open in dependency graph`}
          openDelay={TOOLTIP_OPEN_DELAY_MS}
        >
          <ActionIcon
            component={ForwardRefLink}
            to={Urls.dependencyGraph({ entry: node })}
            w="1.5rem"
            miw="1.5rem"
            h="1.5rem"
            mih="1.5rem"
            aria-label={t`Open in dependency graph`}
            onClick={onClose}
          >
            <FixedSizeIcon name="dependencies" />
          </ActionIcon>
        </Tooltip>
        <ActionIcon
          w="1.5rem"
          miw="1.5rem"
          h="1.5rem"
          mih="1.5rem"
          aria-label={t`Close`}
          onClick={onClose}
        >
          <FixedSizeIcon name="close" />
        </ActionIcon>
      </Group>
    </Group>
  );
}
