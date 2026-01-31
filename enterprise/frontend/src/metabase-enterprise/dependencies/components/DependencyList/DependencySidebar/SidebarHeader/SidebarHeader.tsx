import cx from "classnames";
import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import CS from "metabase/css/core/index.css";
import * as Urls from "metabase/lib/urls";
import { ActionIcon, Anchor, FixedSizeIcon, Group, Tooltip } from "metabase/ui";
import type { DependencyNode } from "metabase-types/api";

import { TOOLTIP_OPEN_DELAY_MS } from "../../../../constants";
import { getNodeLabel, getNodeLink } from "../../../../utils";
import S from "../DependencySidebar.module.css";

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
      <Group gap="xs" wrap="nowrap">
        {link != null && (
          <Tooltip label={link.label} openDelay={TOOLTIP_OPEN_DELAY_MS}>
            <ActionIcon
              component={ForwardRefLink}
              to={link.url}
              target="_blank"
              aria-label={link.label}
            >
              <FixedSizeIcon name="external" />
            </ActionIcon>
          </Tooltip>
        )}
        <Tooltip
          label={t`View in dependency graph`}
          openDelay={TOOLTIP_OPEN_DELAY_MS}
        >
          <ActionIcon
            component={ForwardRefLink}
            to={Urls.dependencyGraph({ entry: node })}
            target="_blank"
            aria-label={t`View in dependency graph`}
          >
            <FixedSizeIcon name="dependencies" />
          </ActionIcon>
        </Tooltip>
        <ActionIcon aria-label={t`Close`} onClick={onClose}>
          <FixedSizeIcon name="close" />
        </ActionIcon>
      </Group>
    </Group>
  );
}
