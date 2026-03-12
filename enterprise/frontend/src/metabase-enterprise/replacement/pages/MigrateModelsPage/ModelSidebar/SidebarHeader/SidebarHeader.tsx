import cx from "classnames";
import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import CS from "metabase/css/core/index.css";
import * as Urls from "metabase/lib/urls";
import { ActionIcon, Anchor, FixedSizeIcon, Group, Tooltip } from "metabase/ui";
import type { SearchResult } from "metabase-types/api";

import S from "./SidebarHeader.module.css";

type SidebarHeaderProps = {
  result: SearchResult;
  onClose: () => void;
};

export function SidebarHeader({ result, onClose }: SidebarHeaderProps) {
  const id = Number(result.id);
  const link = Urls.question({ id: id, name: result.name });

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
        {result.name}
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
              entry: { id: id, type: "card" },
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
