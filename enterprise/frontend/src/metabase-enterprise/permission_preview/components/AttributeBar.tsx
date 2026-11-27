import { skipToken } from "@reduxjs/toolkit/query";
import { type KeyboardEvent, useMemo, useState } from "react";
import { t } from "ttag";

import {
  useGetGroupPermissionsGraphQuery,
  useListDatabasesQuery,
  useListGroupTableAccessPoliciesQuery,
} from "metabase/api";
import { parseItem } from "metabase/embedding/permission-preview/item";
import { Box, Button, Flex, Popover, Text, TextInput } from "metabase/ui";
import {
  useGetPermissionDebugQuery,
  useListImpersonationsQuery,
} from "metabase-enterprise/api";
import type { GroupInfo, GroupPermissions, UserId } from "metabase-types/api";

import {
  type GroupAttribute,
  getGroupAttributes,
  getUseDescription,
} from "../utils/group-attributes";

import { AttributeChip } from "./AttributeChip";

interface AttributeBarProps {
  group: GroupInfo;
  /** The person the preview runs as, once it has started */
  userId?: UserId;
  /** The item the frame shows, as `type/id` */
  item?: string;
  values: Record<string, string>;
  onApply: (name: string, value: string) => void;
}

const QUERY_ACTIONS = {
  question: "card/query",
  dashboard: "dashboard/query",
} as const;

/**
 * The attributes the rules on a question's or dashboard's data read, or
 * `undefined` for a collection, when nothing is open yet or while it loads,
 * where every attribute of the group is shown.
 */
function useItemAttributeNames(userId?: UserId, item?: string) {
  const parsed = item ? parseItem(item) : null;
  const type =
    parsed?.type === "question" || parsed?.type === "dashboard"
      ? parsed.type
      : null;
  const modelId = typeof parsed?.id === "number" ? parsed.id : null;

  const { currentData } = useGetPermissionDebugQuery(
    userId != null && type != null && modelId != null
      ? {
          user_id: userId,
          model_id: modelId,
          action_type: QUERY_ACTIONS[type],
        }
      : skipToken,
  );
  const reasons = currentData?.reasons;

  return useMemo(() => {
    if (!reasons) {
      return undefined;
    }
    return new Set([
      ...(reasons.tables ?? []).flatMap((table) =>
        table.sandboxes.flatMap((sandbox) =>
          sandbox.filters.map((filter) => filter.attribute),
        ),
      ),
      ...(reasons.impersonations ?? []).map(({ attribute }) => attribute),
      ...(reasons.routes ?? []).map(({ attribute }) => attribute),
    ]);
  }, [reasons]);
}

function getViewableDatabaseIds(permissions: GroupPermissions = {}) {
  return new Set(
    Object.entries(permissions)
      .filter(([, database]) => {
        const viewData = database["view-data"];
        return viewData != null && viewData !== "blocked";
      })
      .map(([databaseId]) => Number(databaseId)),
  );
}

/** The user attributes a group's rules read, each with the value the preview uses. */
export function AttributeBar({
  group,
  userId,
  item,
  values,
  onApply,
}: AttributeBarProps) {
  const { data: policies = [] } = useListGroupTableAccessPoliciesQuery({
    group_id: group.id,
  });
  const { data: impersonations = [] } = useListImpersonationsQuery();
  const { data: databases } = useListDatabasesQuery({ include: "tables" });

  const { data: graph } = useGetGroupPermissionsGraphQuery(group.id);

  const usedAttributeNames = useItemAttributeNames(userId, item);

  const attributes = getGroupAttributes({
    groupId: group.id,
    policies,
    impersonations,
    databases: databases?.data ?? [],
    viewableDatabaseIds: getViewableDatabaseIds(graph?.groups[group.id]),
  }).filter(
    ({ name }) => usedAttributeNames == null || usedAttributeNames.has(name),
  );

  if (attributes.length === 0) {
    return null;
  }

  return (
    <Flex align="center" wrap="wrap" gap="sm">
      <Text c="text-secondary">{t`User attributes used by rules:`}</Text>
      {attributes.map((attribute) => (
        <AttributeValue
          key={attribute.name}
          attribute={attribute}
          value={values[attribute.name]}
          onApply={(value) => onApply(attribute.name, value)}
        />
      ))}
    </Flex>
  );
}

interface AttributeValueProps {
  attribute: GroupAttribute;
  value?: string;
  onApply: (value: string) => void;
}

function AttributeValue({ attribute, value, onApply }: AttributeValueProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState(value ?? "");

  function toggle() {
    setDraft(value ?? "");
    setIsOpen((wasOpen) => !wasOpen);
  }

  function apply() {
    setIsOpen(false);
    onApply(draft.trim());
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      apply();
    }
  }

  return (
    <Popover
      opened={isOpen}
      position="bottom-start"
      offset={4}
      onChange={setIsOpen}
    >
      <Popover.Target>
        <AttributeChip
          name={attribute.name}
          value={value}
          isOpen={isOpen}
          onClick={toggle}
        />
      </Popover.Target>
      <Popover.Dropdown p="md" w="20rem">
        <TextInput
          size="lg"
          data-autofocus
          label={attribute.name}
          description={
            <>
              {attribute.uses.map((use) => (
                <Box component="span" display="block" key={use.kind}>
                  {getUseDescription(use)}
                </Box>
              ))}
            </>
          }
          placeholder={t`No value`}
          value={draft}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onKeyDown={handleKeyDown}
        />
        <Flex justify="flex-end" mt="md">
          <Button variant="filled" onClick={apply}>{t`Apply`}</Button>
        </Flex>
      </Popover.Dropdown>
    </Popover>
  );
}
