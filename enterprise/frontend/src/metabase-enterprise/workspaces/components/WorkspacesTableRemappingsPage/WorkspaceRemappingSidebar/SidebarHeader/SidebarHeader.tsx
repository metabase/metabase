import cx from "classnames";
import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import CS from "metabase/css/core/index.css";
import {
  ActionIcon,
  Anchor,
  Box,
  FixedSizeIcon,
  Group,
  Tooltip,
} from "metabase/ui";
import { TOOLTIP_OPEN_DELAY } from "metabase/utils/constants";

import S from "./SidebarHeader.module.css";

type SidebarHeaderLink = {
  label: string;
  url: string;
};

type SidebarHeaderProps = {
  title: string;
  link?: SidebarHeaderLink;
  dependencyGraphUrl?: string;
  onClose: () => void;
};

export function SidebarHeader({
  title,
  link,
  dependencyGraphUrl,
  onClose,
}: SidebarHeaderProps) {
  return (
    <Group
      gap="0.75rem"
      wrap="nowrap"
      align="start"
      justify="space-between"
      data-testid="workspace-remapping-sidebar-header"
    >
      {link != null ? (
        <Anchor
          className={cx(CS.textWrap, S.link)}
          component={ForwardRefLink}
          fz="h3"
          fw="bold"
          lh="h3"
          to={link.url}
          target="_blank"
        >
          {title}
        </Anchor>
      ) : (
        <Box className={CS.textWrap} fz="h3" fw="bold" lh="h3">
          {title}
        </Box>
      )}
      <Group gap="xs" wrap="nowrap">
        {link != null && (
          <Tooltip label={link.label} openDelay={TOOLTIP_OPEN_DELAY}>
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
        {dependencyGraphUrl != null && (
          <Tooltip
            label={t`View in dependency graph`}
            openDelay={TOOLTIP_OPEN_DELAY}
          >
            <ActionIcon
              component={ForwardRefLink}
              to={dependencyGraphUrl}
              target="_blank"
              aria-label={t`View in dependency graph`}
            >
              <FixedSizeIcon name="dependencies" />
            </ActionIcon>
          </Tooltip>
        )}
        <ActionIcon aria-label={t`Close`} onClick={onClose}>
          <FixedSizeIcon name="close" />
        </ActionIcon>
      </Group>
    </Group>
  );
}
