import { t } from "ttag";

import { getGroupNameLocalized } from "metabase/common/utils/groups";
import { ActionIcon, FixedSizeIcon, Flex, Icon, Text } from "metabase/ui";
import type { GroupId } from "metabase-types/api";

import S from "./JWTGroupMappingSection.module.css";
import type { GroupLookup } from "./utils";

export function MappingRow({
  name,
  groupIds,
  groupLookup,
  readOnly,
  disabled,
  onEdit,
  onDelete,
}: {
  name: string;
  groupIds: GroupId[];
  groupLookup: GroupLookup;
  readOnly: boolean;
  disabled: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Flex
      className={S.mappingRow}
      align="center"
      gap="lg"
      data-testid="jwt-group-mapping-row"
    >
      <Flex flex={1} miw={0} align="center" gap="lg" wrap="wrap">
        <Text fw="bold" flex="0 0 auto" maw="100%" className={S.wrappableText}>
          {name}
        </Text>
        <FixedSizeIcon aria-hidden name="arrow_right" c="text-secondary" />
        <MappingRowGroups groupIds={groupIds} groupLookup={groupLookup} />
      </Flex>
      {!readOnly && (
        <Flex className={S.rowActions} gap="sm">
          <ActionIcon
            aria-label={t`Edit mapping`}
            disabled={disabled}
            onClick={onEdit}
          >
            <Icon name="pencil" />
          </ActionIcon>
          <ActionIcon
            aria-label={t`Delete mapping`}
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

function MappingRowGroups({
  groupIds,
  groupLookup,
}: {
  groupIds: GroupId[];
  groupLookup: GroupLookup;
}) {
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
  // sized by content, so the names only drop under the mapping name when they don't fit
  return (
    <Text flex="1 1 auto" miw={0} className={S.wrappableText}>
      {names.join(", ")}
    </Text>
  );
}
