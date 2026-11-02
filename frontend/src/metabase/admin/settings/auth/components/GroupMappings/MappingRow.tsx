import { useId } from "react";
import { t } from "ttag";

import { getGroupNameLocalized } from "metabase/common/utils/groups";
import { ActionIcon, FixedSizeIcon, Flex, Icon, Text } from "metabase/ui";
import type { GroupId } from "metabase-types/api";

import S from "./GroupMappings.module.css";
import type { GroupLookup } from "./utils";

type MappingRowProps = {
  name: string;
  groupIds: GroupId[];
  groupLookup: GroupLookup;
  readOnly: boolean;
  disabled: boolean;
  onEdit: () => void;
  onDelete: () => void;
};

export function MappingRow({
  name,
  groupIds,
  groupLookup,
  readOnly,
  disabled,
  onEdit,
  onDelete,
}: MappingRowProps) {
  const nameId = useId();

  return (
    <Flex
      className={S.mappingRow}
      align="center"
      gap="lg"
      data-testid="group-mapping-row"
    >
      <Flex flex={1} miw={0} align="center" gap="lg" wrap="wrap">
        <Text
          id={nameId}
          fw="bold"
          flex="0 0 auto"
          maw="100%"
          className={S.wrappableText}
        >
          {name}
        </Text>
        {groupLookup.isLoaded && (
          <>
            <FixedSizeIcon aria-hidden name="arrow_right" c="text-secondary" />
            <MappingRowGroups groupIds={groupIds} groupLookup={groupLookup} />
          </>
        )}
      </Flex>
      {!readOnly && (
        <Flex className={S.rowActions} gap="sm">
          <ActionIcon
            variant="subtle"
            aria-label={t`Edit mapping`}
            aria-describedby={nameId}
            disabled={disabled}
            onClick={onEdit}
          >
            <Icon name="pencil" />
          </ActionIcon>
          <ActionIcon
            variant="subtle"
            aria-label={t`Delete mapping`}
            aria-describedby={nameId}
            disabled={disabled}
            onClick={onDelete}
          >
            <Icon name="trash" />
          </ActionIcon>
        </Flex>
      )}
    </Flex>
  );
}

type MappingRowGroupsProps = {
  groupIds: GroupId[];
  groupLookup: GroupLookup;
};

function MappingRowGroups({ groupIds, groupLookup }: MappingRowGroupsProps) {
  const names = groupIds
    .map((groupId) => {
      const group = groupLookup.getGroup(groupId);
      return group ? getGroupNameLocalized(group) : null;
    })
    .filter((groupName) => groupName != null);

  // zero-group mappings can't be created here anymore, but exist in the wild
  if (names.length === 0) {
    return (
      <Text flex="1 1 auto" miw={0} c="text-secondary">
        {t`No groups`}
      </Text>
    );
  }
  return (
    <Text flex="1 1 auto" miw={0} className={S.wrappableText}>
      {names.join(", ")}
    </Text>
  );
}
