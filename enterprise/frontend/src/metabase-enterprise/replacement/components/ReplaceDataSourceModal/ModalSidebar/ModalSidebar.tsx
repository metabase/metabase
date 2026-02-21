import { msgid, ngettext, t } from "ttag";

import { Button, Group, Stack, Text, Title } from "metabase/ui";
import type {
  CheckReplaceSourceInfo,
  ReplaceSourceEntry,
} from "metabase-types/api";

import { getEntityErrorMessage, getGenericErrorMessage } from "../../../utils";
import type { EntityItem } from "../types";

import { EntitySection } from "./EntitySection";
import { EntitySelect } from "./EntitySelect";
import S from "./ModalSidebar.module.css";

type ModalSidebarProps = {
  sourceItem: EntityItem | undefined;
  targetItem: EntityItem | undefined;
  checkInfo: CheckReplaceSourceInfo | undefined;
  dependentsCount: number | undefined;
  canReplace: boolean;
  onSourceChange: (sourceEntry: ReplaceSourceEntry) => void;
  onTargetChange: (targetEntry: ReplaceSourceEntry) => void;
  onSubmit: () => void;
  onCancel: () => void;
};

export function ModalSidebar({
  sourceItem,
  targetItem,
  checkInfo,
  dependentsCount,
  canReplace,
  onSourceChange,
  onTargetChange,
  onSubmit,
  onCancel,
}: ModalSidebarProps) {
  const sourceDatabaseId = getSourceDatabaseId(sourceItem);
  const sourceError = getSourceError(dependentsCount);
  const targetError = getTargetError(checkInfo);

  return (
    <Stack className={S.sidebar} px="xl" pt="xl" pb="lg" gap="lg" maw="35rem">
      <Stack gap="sm">
        <Title order={2}>{t`Find and replace a data source`}</Title>
        <Text>{t`This lets you change the data source used in queries in bulk. `}</Text>
      </Stack>
      <Stack gap="lg">
        <EntitySection icon="search" error={sourceError}>
          <EntitySelect
            selectedItem={sourceItem}
            label={t`Find all occurrences of this data source`}
            description={t`We'll look for every query in your instance that uses this data source.`}
            onChange={onSourceChange}
          />
        </EntitySection>
        <EntitySection icon="find_replace" error={targetError}>
          <EntitySelect
            selectedItem={targetItem}
            label={t`Replace it with this data source`}
            description={t`It must be based on the same database and include all columns from the original data source.`}
            databaseId={sourceDatabaseId}
            disabledItem={sourceItem}
            onChange={onTargetChange}
          />
        </EntitySection>
      </Stack>
      <Group mt="auto" justify="flex-end" wrap="nowrap">
        <Button onClick={onCancel}>{t`Cancel`}</Button>
        <Button variant="filled" disabled={!canReplace} onClick={onSubmit}>
          {getSubmitLabel(dependentsCount, canReplace)}
        </Button>
      </Group>
    </Stack>
  );
}

function getSourceDatabaseId(item: EntityItem | undefined) {
  return item?.type === "table" ? item.data?.db_id : item?.data?.database_id;
}

function getSourceError(dependentsCount: number | undefined) {
  if (dependentsCount === 0) {
    return t`Nothing uses this data source, so there's nothing to replace.`;
  }
}

function getTargetError(checkInfo: CheckReplaceSourceInfo | undefined) {
  if (checkInfo == null || checkInfo.success) {
    return undefined;
  }

  const errors = checkInfo.errors ?? [];
  return errors.length === 1
    ? getEntityErrorMessage(errors[0])
    : getGenericErrorMessage();
}

function getSubmitLabel(
  dependentsCount: number | undefined,
  canReplace: boolean,
) {
  if (dependentsCount == null || !canReplace) {
    return t`Replace data source`;
  }
  return ngettext(
    msgid`Replace data source in ${dependentsCount} items`,
    `Replace data source in ${dependentsCount} items`,
    dependentsCount,
  );
}
