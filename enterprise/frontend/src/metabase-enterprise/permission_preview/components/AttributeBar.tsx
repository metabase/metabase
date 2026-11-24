import { type KeyboardEvent, useState } from "react";
import { t } from "ttag";

import {
  useListDatabasesQuery,
  useListGroupTableAccessPoliciesQuery,
} from "metabase/api";
import { Box, Button, Flex, Popover, Text, TextInput } from "metabase/ui";
import { useListImpersonationsQuery } from "metabase-enterprise/api";
import type { GroupInfo } from "metabase-types/api";

import {
  type GroupAttribute,
  getGroupAttributes,
  getUseDescription,
} from "../utils/group-attributes";

import { AttributeChip } from "./AttributeChip";

interface AttributeBarProps {
  group: GroupInfo;
  values: Record<string, string>;
  onApply: (name: string, value: string) => void;
}

/** The user attributes a group's rules read, each with the value the preview uses. */
export function AttributeBar({ group, values, onApply }: AttributeBarProps) {
  const { data: policies = [] } = useListGroupTableAccessPoliciesQuery({
    group_id: group.id,
  });
  const { data: impersonations = [] } = useListImpersonationsQuery();
  const { data: databases } = useListDatabasesQuery({ include: "tables" });

  const attributes = getGroupAttributes({
    groupId: group.id,
    policies,
    impersonations,
    databases: databases?.data ?? [],
  });

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
