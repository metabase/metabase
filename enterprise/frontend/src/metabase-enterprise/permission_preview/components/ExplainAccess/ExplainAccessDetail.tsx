import type { ReactNode } from "react";
import { t } from "ttag";

import {
  Badge,
  Box,
  Flex,
  Icon,
  Stack,
  Text,
  UnstyledButton,
} from "metabase/ui";
import type {
  PermissionDebugAnswer,
  PermissionDebugCollection,
  PermissionDebugGroupValue,
  PermissionDebugSandbox,
  PermissionDebugTable,
} from "metabase-types/api";

import type { PreviewTarget } from "../types";

import { getSubject } from "./explain";
import {
  getCollectionValueLabel,
  getCreateQueriesLabel,
  getDownloadLabel,
  getViewDataLabel,
} from "./labels";

export type TablePermission =
  | "view-data"
  | "create-queries"
  | "download-results";

export type ExplainDetail =
  | { kind: "collection" }
  | { kind: "table"; tableId: number; permission: TablePermission };

interface ExplainAccessDetailProps {
  detail: ExplainDetail;
  target: PreviewTarget;
  query?: PermissionDebugAnswer;
  collection?: PermissionDebugCollection;
  onBack: () => void;
}

export function ExplainAccessDetail({
  detail,
  target,
  query,
  collection,
  onBack,
}: ExplainAccessDetailProps) {
  if (detail.kind === "collection") {
    return collection ? (
      <DetailPage
        title={t`${collection.name} · Collection access`}
        onBack={onBack}
      >
        <GroupsCard
          target={target}
          groups={collection.groups}
          getLabel={getCollectionValueLabel}
          isNothing={(value) => value === "none"}
          note={
            collection["by-rule"]
              ? t`Curated by rule, not by a group.`
              : undefined
          }
        />
      </DetailPage>
    ) : null;
  }

  const table = query?.reasons.tables?.find(
    (candidate) => candidate["table-id"] === detail.tableId,
  );
  return table ? (
    <TableDetail
      table={table}
      permission={detail.permission}
      target={target}
      onBack={onBack}
    />
  ) : null;
}

interface DetailPageProps {
  title: string;
  onBack: () => void;
  children: ReactNode;
}

function DetailPage({ title, onBack, children }: DetailPageProps) {
  return (
    <Stack gap="md">
      <UnstyledButton onClick={onBack} aria-label={t`Back`}>
        <Flex gap="xs" align="center">
          <Icon name="chevronleft" />
          <Text fw="bold">{title}</Text>
        </Flex>
      </UnstyledButton>
      {children}
    </Stack>
  );
}

interface TableDetailProps {
  table: PermissionDebugTable;
  permission: TablePermission;
  target: PreviewTarget;
  onBack: () => void;
}

function TableDetail({ table, permission, target, onBack }: TableDetailProps) {
  const enforcedSandboxes = table.sandboxes.filter(
    (sandbox) => sandbox["enforced?"],
  );
  const permissionLabels = {
    "view-data": t`View data`,
    "create-queries": t`Create queries`,
    "download-results": t`Download results`,
  };
  const getLabel = {
    "view-data": getViewDataLabel,
    "create-queries": getCreateQueriesLabel,
    "download-results": getDownloadLabel,
  }[permission];

  return (
    <DetailPage
      title={t`${table.name} · ${permissionLabels[permission]}`}
      onBack={onBack}
    >
      {permission === "view-data" && enforcedSandboxes.length > 0 && (
        <SandboxCard
          subject={getSubject(target)}
          tableName={table.name}
          sandboxes={enforcedSandboxes}
        />
      )}
      <GroupsCard
        target={target}
        groups={table[permission].groups}
        getLabel={getLabel}
        isNothing={(value) => isNothingValue(permission, value)}
        nothingText={
          permission === "view-data"
            ? t`Blocked in every group ${getSubject(target)} is in.`
            : undefined
        }
        rowsFilteredGroupIds={enforcedSandboxes.map(
          (sandbox) => sandbox["group-id"],
        )}
      />
    </DetailPage>
  );
}

function isNothingValue(permission: TablePermission, value: string) {
  return (
    (permission === "view-data" && value === "blocked") ||
    (permission !== "view-data" && value === "no")
  );
}

interface SandboxCardProps {
  subject: string;
  tableName: string;
  sandboxes: PermissionDebugSandbox[];
}

function SandboxCard({ subject, tableName, sandboxes }: SandboxCardProps) {
  return (
    <Stack gap="sm">
      <Text fw="bold">{t`Result`}</Text>
      <Text>{t`${subject} sees only the ${tableName} rows that match the attributes below.`}</Text>
      {sandboxes.map((sandbox) => (
        <Stack key={sandbox["sandbox-id"]} gap="xs">
          <Text fw="bold">{t`Row and column security`}</Text>
          <Text c="text-secondary">{t`Set by ${sandbox["group-name"]}`}</Text>
          {sandbox.filters.map((filter) => (
            <Flex key={filter.attribute} gap="sm" align="center" wrap="wrap">
              <Badge>
                <Text component="span" fw="bold" size="sm">
                  {filter.attribute}
                </Text>{" "}
                {filter["missing?"] ? t`No value` : filter.value}
              </Badge>
              <Text c="text-secondary">{`→ ${filter.column}`}</Text>
              {filter["missing?"] && (
                <Text c="feedback-negative-strong">{t`No value for ${filter.attribute}. Set a value for ${filter.attribute} to see this table.`}</Text>
              )}
            </Flex>
          ))}
          <Text c="text-secondary">
            {sandbox["columns-limited?"]
              ? t`Columns: limited by a saved question`
              : t`Columns: all columns`}
          </Text>
        </Stack>
      ))}
    </Stack>
  );
}

interface GroupsCardProps {
  target: PreviewTarget;
  groups: PermissionDebugGroupValue[];
  getLabel: (value: string) => string;
  isNothing: (value: string) => boolean;
  nothingText?: string;
  rowsFilteredGroupIds?: number[];
  note?: string;
}

function GroupsCard({
  target,
  groups,
  getLabel,
  isNothing,
  nothingText,
  rowsFilteredGroupIds = [],
  note,
}: GroupsCardProps) {
  const isNothingEverywhere =
    groups.length > 0 && groups.every((group) => isNothing(group.value));

  return (
    <Stack gap="sm">
      <Text fw="bold">{t`Groups`}</Text>
      {groups.map((group) => (
        <Flex key={group["group-id"]} gap="sm" align="center">
          <Text flex={1} miw={0} truncate>
            {group["group-name"]}
          </Text>
          {group["applies?"] && <Badge>{t`Applies`}</Badge>}
          <Text>
            {rowsFilteredGroupIds.includes(group["group-id"])
              ? t`Rows filtered`
              : getLabel(group.value)}
          </Text>
        </Flex>
      ))}
      <Box>
        <Text c="text-secondary">
          {isNothingEverywhere
            ? (nothingText ??
              t`No group ${getSubject(target)} is in gives access.`)
            : t`The most permissive group applies.`}
        </Text>
        {note && <Text c="text-secondary">{note}</Text>}
      </Box>
    </Stack>
  );
}
