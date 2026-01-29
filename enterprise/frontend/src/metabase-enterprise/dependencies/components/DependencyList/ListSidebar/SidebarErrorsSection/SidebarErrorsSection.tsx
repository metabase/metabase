import { useClipboard } from "@mantine/hooks";
import cx from "classnames";
import { t } from "ttag";

import { CopyButton } from "metabase/common/components/CopyButton";
import CS from "metabase/css/core/index.css";
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
import type { DependencyNode } from "metabase-types/api";

import type { DependencyErrorGroup } from "../../../../types";
import {
  getDependencyErrorGroups,
  getDependencyErrors,
  getErrorTypeLabel,
} from "../../../../utils";

import S from "./SidebarErrorsSection.module.css";

type SidebarErrorsSectionProps = {
  node: DependencyNode;
};

export function SidebarErrorsSection({ node }: SidebarErrorsSectionProps) {
  const errors = getDependencyErrors(node.dependents_errors ?? []);
  const errorGroups = getDependencyErrorGroups(errors);

  return (
    <>
      {errorGroups.map((group) => (
        <ErrorGroupSection key={group.type} group={group} />
      ))}
    </>
  );
}

type ErrorGroupSectionProps = {
  group: DependencyErrorGroup;
};

function ErrorGroupSection({ group }: ErrorGroupSectionProps) {
  const { type, errors } = group;
  const count = errors.length;
  const items = errors
    .map((error) => error.detail)
    .filter((detail) => detail != null);

  return (
    <ErrorList
      title={getErrorTypeLabel(type, count)}
      items={items}
      aria-label={getErrorTypeLabel(type)}
    />
  );
}

type ErrorListProps = {
  title: string;
  items: string[];
  "aria-label": string;
};

function ErrorList({ title, items, "aria-label": ariaLabel }: ErrorListProps) {
  return (
    <Stack role="region" aria-label={ariaLabel}>
      <Group gap="sm" wrap="nowrap">
        <Badge c="text-selected" bg="error">
          {items.length}
        </Badge>
        <Title order={5}>{title}</Title>
      </Group>
      {items.length > 0 && (
        <Card p={0} shadow="none" withBorder>
          {items.map((item, itemIndex) => (
            <ErrorListItem key={itemIndex} item={item} />
          ))}
        </Card>
      )}
    </Stack>
  );
}

type ErrorListItemProps = {
  item: string;
};

function ErrorListItem({ item }: ErrorListItemProps) {
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
        <Box className={cx(CS.textWrap, CS.textMonospace)} fz="sm" lh="1rem">
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
