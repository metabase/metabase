import { msgid, ngettext, t } from "ttag";

import { Button, Group, Stack, Text, Title } from "metabase/ui";
import type {
  CheckReplaceSourceInfo,
  ReplaceSourceEntry,
} from "metabase-types/api";

import type { EntityInfo } from "../types";

import { EntityErrors } from "./EntityErrors";
import { EntitySection } from "./EntitySection";
import { EntitySelect } from "./EntitySelect";
import S from "./ModalSidebar.module.css";

type ModalSidebarProps = {
  sourceInfo: EntityInfo | undefined;
  targetInfo: EntityInfo | undefined;
  checkInfo: CheckReplaceSourceInfo | undefined;
  dependentsCount: number;
  onSourceChange: (sourceEntry: ReplaceSourceEntry) => void;
  onTargetChange: (targetEntry: ReplaceSourceEntry) => void;
  onSubmit: () => void;
  onCancel: () => void;
};

export function ModalSidebar({
  sourceInfo,
  targetInfo,
  checkInfo,
  dependentsCount,
  onSourceChange,
  onTargetChange,
  onSubmit,
  onCancel,
}: ModalSidebarProps) {
  const disabled =
    checkInfo == null || !checkInfo.success || dependentsCount === 0;

  return (
    <Stack className={S.sidebar} px="xl" pt="xl" pb="lg" gap="lg" maw="32rem">
      <Stack gap="sm">
        <Title order={2}>{t`Find and replace a data source`}</Title>
        <Text>{t`This lets you change the data source used in queries in bulk. `}</Text>
      </Stack>
      <Stack gap="lg">
        <EntitySection icon="search">
          <EntitySelect
            entityInfo={sourceInfo}
            label={t`Find all occurrences of this data source`}
            description={t`We'll look for every query in your instance that uses this data source.`}
            onChange={onSourceChange}
          />
        </EntitySection>
        <EntitySection icon="find_replace">
          <Stack>
            <EntitySelect
              entityInfo={targetInfo}
              label={t`Replace it with this data source`}
              description={t`It must be based on the same database and include all columns from the original data source.`}
              onChange={onTargetChange}
            />
            <EntityErrors errors={checkInfo?.errors ?? []} />
          </Stack>
        </EntitySection>
      </Stack>
      <Group mt="auto" justify="flex-end" wrap="nowrap">
        <Button onClick={onCancel}>{t`Cancel`}</Button>
        <Button variant="filled" disabled={disabled} onClick={onSubmit}>
          {getSubmitLabel(dependentsCount, disabled)}
        </Button>
      </Group>
    </Stack>
  );
}

function getSubmitLabel(dependentsCount: number, disabled: boolean) {
  if (disabled) {
    return t`Replace data source`;
  }
  return ngettext(
    msgid`Replace data source in ${dependentsCount} items`,
    `Replace data source in ${dependentsCount} items`,
    dependentsCount,
  );
}
