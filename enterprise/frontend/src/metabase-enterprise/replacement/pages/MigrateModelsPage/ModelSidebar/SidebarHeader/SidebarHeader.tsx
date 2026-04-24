import cx from "classnames";
import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import CS from "metabase/css/core/index.css";
import { ActionIcon, Anchor, FixedSizeIcon, Group, Tooltip } from "metabase/ui";
import * as Urls from "metabase/utils/urls";
import type { Card } from "metabase-types/api";

import S from "./SidebarHeader.module.css";

type SidebarHeaderProps = {
  card: Card;
  onClose: () => void;
};

export function SidebarHeader({ card, onClose }: SidebarHeaderProps) {
  const link = Urls.card({ id: card.id, name: card.name });

  return (
    <Group
      gap="0.75rem"
      wrap="nowrap"
      align="start"
      justify="space-between"
      data-testid="model-sidebar-header"
    >
      <Anchor
        className={cx(CS.textWrap, S.link)}
        component={ForwardRefLink}
        fz="h3"
        fw="bold"
        lh="h3"
        to={link}
        target="_blank"
      >
        {card.name}
      </Anchor>
      <Group gap="xs" wrap="nowrap">
        <Tooltip label={t`Open in new tab`} openDelay={300}>
          <ActionIcon
            component={ForwardRefLink}
            to={link}
            target="_blank"
            aria-label={t`Open in new tab`}
          >
            <FixedSizeIcon name="external" />
          </ActionIcon>
        </Tooltip>
        <Tooltip label={t`View in dependency graph`} openDelay={300}>
          <ActionIcon
            component={ForwardRefLink}
            to={Urls.dependencyGraph({
              entry: { id: card.id, type: "card" },
            })}
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
