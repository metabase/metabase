import type { ReactNode } from "react";
import { t } from "ttag";

import { Badge, Flex, Icon, Stack } from "metabase/ui";
import type {
  PermissionDebugCollection,
  PermissionDebugGroupValue,
  PermissionDebugImpersonation,
  PermissionDebugReasons,
  PermissionDebugTable,
} from "metabase-types/api";

import { AttributeTag } from "../AttributeChip";
import type { PreviewTarget } from "../types";

import {
  BodyText,
  ItemLine,
  PlainStatus,
  SheetCard,
  SmallText,
} from "./ExplainAccessParts";
import {
  capitalize,
  getCollectionName,
  getSourceText,
  getSubject,
  getTableProblemNotes,
  getTableStatusDisplay,
} from "./explain";
import {
  type ValueStatus,
  getCollectionStatus,
  getCollectionValueLabel,
  getCreateQueriesStatus,
  getDownloadLabel,
  getDownloadStatus,
  getViewDataLabel,
  getViewDataStatus,
} from "./labels";

export type TablePermission =
  | "view-data"
  | "create-queries"
  | "download-results";

export type ExplainDetail =
  | { kind: "collection"; collection: PermissionDebugCollection }
  | { kind: "table"; tableId: number; permission: TablePermission };

interface ExplainAccessDetailProps {
  detail: ExplainDetail;
  target: PreviewTarget;
  reasons?: PermissionDebugReasons;
}

/** The reason behind one value: what it says in words, the rule behind it, and what each group gives. */
export function ExplainAccessDetail({
  detail,
  target,
  reasons,
}: ExplainAccessDetailProps) {
  if (detail.kind === "collection") {
    return <CollectionDetail collection={detail.collection} target={target} />;
  }
  const table = reasons?.tables?.find(
    (candidate) => candidate["table-id"] === detail.tableId,
  );
  return table && reasons ? (
    <TableDetail
      table={table}
      permission={detail.permission}
      target={target}
      reasons={reasons}
    />
  ) : null;
}

interface CollectionDetailProps {
  collection: PermissionDebugCollection;
  target: PreviewTarget;
}

function CollectionDetail({ collection, target }: CollectionDetailProps) {
  const who = capitalize(getSubject(target));
  const name = getCollectionName(collection, target);
  const source = getSourceText(collection.groups);
  const sentence =
    collection.value === "none"
      ? t`${who} can't open the ${name} collection.`
      : source
        ? t`${who} has ${getCollectionValueLabel(collection.value)} access to the ${name} collection, ${source}.`
        : t`${who} has ${getCollectionValueLabel(collection.value)} access to the ${name} collection.`;

  return (
    <>
      <ItemLine icon="folder" name={name} target={target} />
      <ResultCard status={getCollectionStatus(collection.value)}>
        {sentence}
      </ResultCard>
      <GroupsCard
        target={target}
        groups={collection.groups}
        getStatus={(value) => getCollectionStatus(value)}
        isNothing={(value) => value === "none"}
        permission={t`Collection access`}
        nothingText={t`No group ${getSubject(target)} is in gives access.`}
      />
    </>
  );
}

interface TableDetailProps {
  table: PermissionDebugTable;
  permission: TablePermission;
  target: PreviewTarget;
  reasons: PermissionDebugReasons;
}

function TableDetail({ table, permission, target, reasons }: TableDetailProps) {
  const subject = getSubject(target);
  const enforcedSandboxes = table.sandboxes.filter(
    (sandbox) => sandbox["enforced?"],
  );
  const impersonations = (reasons.impersonations ?? []).filter(
    (impersonation) =>
      impersonation["db-id"] === table["db-id"] && impersonation["enforced?"],
  );
  const isView = permission === "view-data";
  const notes = isView ? getTableProblemNotes(table, reasons, target) : [];
  const permissionName = {
    "view-data": t`View data`,
    "create-queries": t`Create queries`,
    "download-results": t`Download results`,
  }[permission];

  return (
    <>
      <ItemLine
        icon="table"
        name={table.name}
        database={table["db-name"]}
        target={target}
      />
      <ResultCard
        status={getResultStatus(
          table,
          permission,
          enforcedSandboxes.length > 0,
        )}
        notes={notes}
      >
        {getResultSentence(
          table,
          permission,
          target,
          enforcedSandboxes,
          impersonations,
        )}
      </ResultCard>
      {isView &&
        enforcedSandboxes.map((sandbox) => (
          <SheetCard
            key={sandbox["sandbox-id"]}
            title={t`Row and column security`}
          >
            <Stack gap="lg" py="sm">
              <KeyValue label={t`Set by`}>{sandbox["group-name"]}</KeyValue>
              <KeyValue label={t`Rows`}>
                <Stack gap="sm">
                  {sandbox.filters.map((filter) => (
                    <Flex
                      key={filter.attribute}
                      align="center"
                      gap="sm"
                      wrap="wrap"
                    >
                      <AttributeTag
                        name={filter.attribute}
                        value={filter.value ?? undefined}
                      />
                      <SmallText>{`→ ${filter.column}`}</SmallText>
                    </Flex>
                  ))}
                </Stack>
              </KeyValue>
              <KeyValue label={t`Columns`}>
                {sandbox["columns-limited?"]
                  ? t`Limited by a saved question`
                  : t`All columns`}
              </KeyValue>
            </Stack>
          </SheetCard>
        ))}
      {isView &&
        impersonations.map((impersonation) => (
          <ImpersonationCard
            key={impersonation["group-id"]}
            impersonation={impersonation}
          />
        ))}
      <GroupsCard
        target={target}
        groups={table[permission].groups}
        getStatus={getGroupStatus(permission)}
        isNothing={(value) =>
          (isView && value === "blocked") || (!isView && value === "no")
        }
        permission={permissionName}
        nothingText={
          isView
            ? t`${capitalize(subject)} is blocked in every group they're in. To let them see this table, give one of those groups access.`
            : undefined
        }
        rowsFilteredGroupIds={enforcedSandboxes.map(
          (sandbox) => sandbox["group-id"],
        )}
      />
    </>
  );
}

function getGroupStatus(permission: TablePermission) {
  return {
    "view-data": getViewDataStatus,
    "create-queries": getCreateQueriesStatus,
    "download-results": getDownloadStatus,
  }[permission];
}

function getResultStatus(
  table: PermissionDebugTable,
  permission: TablePermission,
  isFiltered: boolean,
): ValueStatus {
  if (permission === "view-data") {
    return isFiltered
      ? getTableStatusDisplay("filtered")
      : getViewDataStatus(table["view-data"].value);
  }
  return permission === "create-queries"
    ? getCreateQueriesStatus(table["create-queries"].value)
    : getDownloadStatus(table["download-results"].value);
}

function getResultSentence(
  table: PermissionDebugTable,
  permission: TablePermission,
  target: PreviewTarget,
  sandboxes: PermissionDebugTable["sandboxes"],
  impersonations: PermissionDebugImpersonation[],
) {
  const who = capitalize(getSubject(target));
  const tableName = table.name;
  const database = table["db-name"];
  const source = getSourceText(table[permission].groups);
  const suffix = source ? `, ${source}` : "";

  if (permission === "view-data") {
    if (table["view-data"].value === "blocked") {
      return t`${who} is blocked from ${database} / ${tableName}.`;
    }
    if (sandboxes.some((sandbox) => sandbox["columns-limited?"])) {
      return t`${who} sees only the ${tableName} rows and columns that the saved question below returns.`;
    }
    if (sandboxes.length > 0) {
      return t`${who} sees only the ${tableName} rows that match the user attributes below.`;
    }
    if (impersonations.length > 0) {
      return t`${who} queries ${database} with the database role below.`;
    }
    const value = getViewDataLabel(table["view-data"].value);
    return t`${who} has View data set to ${value} on ${tableName}${suffix}.`;
  }

  if (permission === "create-queries") {
    switch (table["create-queries"].value) {
      case "query-builder-and-native":
        return t`${who} can explore ${tableName} with the query builder and native queries${suffix}.`;
      case "query-builder":
        return t`${who} can explore ${tableName} with the query builder, but not with native queries${suffix}.`;
      default:
        return t`${who} can't explore ${tableName}.`;
    }
  }

  const value = getDownloadLabel(table["download-results"].value);
  return t`${who} has Download results set to ${value} on ${tableName}${suffix}.`;
}

interface ResultCardProps {
  status: ValueStatus;
  notes?: string[];
  children: string;
}

function ResultCard({ status, notes = [], children }: ResultCardProps) {
  return (
    <SheetCard title={t`Result`}>
      <Stack gap="sm" py="sm">
        <Flex gap="sm" align="flex-start" wrap="nowrap">
          <Icon name={status.icon} c={status.color} mt="xs" flex="none" />
          <BodyText>{children}</BodyText>
        </Flex>
        {notes.map((note) => (
          <BodyText key={note}>{note}</BodyText>
        ))}
      </Stack>
    </SheetCard>
  );
}

function KeyValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <SmallText>{label}</SmallText>
      <BodyText>{children}</BodyText>
    </div>
  );
}

function ImpersonationCard({
  impersonation,
}: {
  impersonation: PermissionDebugImpersonation;
}) {
  return (
    <SheetCard title={t`Connection impersonation`}>
      <Stack gap="lg" py="sm">
        <KeyValue label={t`Set by`}>{impersonation["group-name"]}</KeyValue>
        <KeyValue label={t`Database role`}>
          {impersonation.value ?? t`No value`}
        </KeyValue>
      </Stack>
    </SheetCard>
  );
}

interface GroupsCardProps {
  target: PreviewTarget;
  groups: PermissionDebugGroupValue[];
  permission: string;
  getStatus: (value: string) => ValueStatus;
  isNothing: (value: string) => boolean;
  nothingText?: string;
  rowsFilteredGroupIds?: number[];
}

function GroupsCard({
  target,
  groups,
  permission,
  getStatus,
  isNothing,
  nothingText,
  rowsFilteredGroupIds = [],
}: GroupsCardProps) {
  const subject = capitalize(getSubject(target));
  const ordered = [
    ...groups.filter((group) => group["applies?"]),
    ...groups.filter((group) => !group["applies?"]),
  ];
  const isNothingEverywhere =
    groups.length > 0 && groups.every((group) => isNothing(group.value));
  const sharedValue = groups.every((group) => group.value === groups[0]?.value)
    ? groups[0]?.value
    : undefined;

  return (
    <SheetCard title={t`Groups`}>
      <Stack gap="lg" py="sm">
        {ordered.map((group) => (
          <Flex
            key={group["group-id"]}
            gap="sm"
            align="flex-start"
            justify="space-between"
            wrap="wrap"
          >
            <BodyText>{group["group-name"]}</BodyText>
            <Flex gap="sm" align="center">
              {group["applies?"] && <Badge variant="light">{t`Applies`}</Badge>}
              <PlainStatus
                status={
                  rowsFilteredGroupIds.includes(group["group-id"])
                    ? getTableStatusDisplay("filtered")
                    : getStatus(group.value)
                }
              />
            </Flex>
          </Flex>
        ))}
        <BodyText>
          {isNothingEverywhere && nothingText
            ? nothingText
            : sharedValue !== undefined && groups.length > 1
              ? t`${subject} has ${permission} set to ${getStatus(sharedValue).label} in every group they're in.`
              : t`The most permissive group applies.`}
        </BodyText>
      </Stack>
    </SheetCard>
  );
}
