import { useClipboard } from "@mantine/hooks";
import cx from "classnames";
import { t } from "ttag";

import { CopyButton } from "metabase/common/components/CopyButton";
import CS from "metabase/css/core/index.css";
import type { ColorName } from "metabase/lib/colors";
import {
  ActionIcon,
  Badge,
  Box,
  Card,
  FixedSizeIcon,
  Group,
  Stack,
  Title,
  Tooltip,
} from "metabase/ui";

import S from "./SidebarListSection.module.css";

type SidebarListSectionProps = {
  title: string;
  items: string[];
  badgeColor: ColorName;
  isMonospace?: boolean;
  "aria-label"?: string;
};

export function SidebarListSection({
  title,
  items,
  badgeColor,
  isMonospace = false,
  "aria-label": ariaLabel,
}: SidebarListSectionProps) {
  return (
    <Stack role="region" aria-label={ariaLabel}>
      <Group gap="sm" wrap="nowrap">
        <Badge c="text-selected" bg={badgeColor}>
          {items.length}
        </Badge>
        <Title order={5}>{title}</Title>
      </Group>
      {items.length > 0 && (
        <Card p={0} shadow="none" withBorder>
          {items.map((item, itemIndex) => (
            <ListItem key={itemIndex} item={item} isMonospace={isMonospace} />
          ))}
        </Card>
      )}
    </Stack>
  );
}

type ListItemProps = {
  item: string;
  isMonospace: boolean;
};

function ListItem({ item, isMonospace }: ListItemProps) {
  const clipboard = useClipboard();

  const handleClick = () => {
    clipboard.copy(item);
  };

  return (
    <Tooltip opened={clipboard.copied} label={t`Copied!`}>
      <Group
        className={cx(S.item, CS.hoverParent, CS.hoverVisibility)}
        p="md"
        justify="space-between"
        wrap="nowrap"
        onClick={handleClick}
      >
        <Box
          className={cx(CS.textWrap, { [CS.textMonospace]: isMonospace })}
          fz="sm"
          lh="1rem"
        >
          {item}
        </Box>
        <CopyButton
          className={CS.hoverChild}
          value={item}
          target={
            <ActionIcon aria-label={t`Copy`}>
              <FixedSizeIcon name="copy" />
            </ActionIcon>
          }
        />
      </Group>
    </Tooltip>
  );
}
