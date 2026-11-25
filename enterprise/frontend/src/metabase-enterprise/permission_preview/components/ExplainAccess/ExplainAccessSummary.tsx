import { Fragment } from "react";
import { msgid, ngettext, t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Flex, Icon, Stack, Text } from "metabase/ui";
import { useGetPermissionDebugAccessQuery } from "metabase-enterprise/api";
import type {
  PermissionDebugAccess,
  PermissionDebugReasons,
  PermissionDebugTable,
  UserId,
} from "metabase-types/api";

import type { PreviewTarget } from "../types";

import { TableRules } from "./ExplainAccessBody";
import type { ExplainDetail } from "./ExplainAccessDetail";
import {
  BodyText,
  Disclosure,
  FoldStatus,
  Row,
  SheetCard,
  StatusButton,
  ToggleRow,
} from "./ExplainAccessParts";
import {
  type TableStatus,
  capitalize,
  countCollectionValues,
  countTableStatuses,
  getCollectionName,
  getSubject,
  getTableStatus,
  getTableStatusDisplay,
  getTableStatusLabel,
} from "./explain";
import { getCollectionStatus } from "./labels";

const TABLE_STATUS_ORDER: TableStatus[] = [
  "filtered",
  "cant-load",
  "blocked",
  "can-view",
];

interface ExplainAccessSummaryProps {
  userId: UserId;
  target: PreviewTarget;
  /** Opens a value's reason, which is read from the reasons of this summary's own answer */
  onOpenDetail: (
    detail: ExplainDetail,
    reasons: PermissionDebugReasons,
  ) => void;
}

/** Everything the person can reach: every collection and table, folded by status. */
export function ExplainAccessSummary({
  userId,
  target,
  onOpenDetail,
}: ExplainAccessSummaryProps) {
  const { currentData, error, isFetching } = useGetPermissionDebugAccessQuery({
    "user-id": userId,
  });

  return (
    <LoadingAndErrorWrapper
      loading={isFetching}
      error={error ? t`Couldn't explain this access.` : null}
    >
      {currentData && (
        <SummaryCard
          access={currentData}
          target={target}
          onOpenDetail={onOpenDetail}
        />
      )}
    </LoadingAndErrorWrapper>
  );
}

interface SummaryCardProps {
  access: PermissionDebugAccess;
  target: PreviewTarget;
  onOpenDetail: ExplainAccessSummaryProps["onOpenDetail"];
}

function SummaryCard({ access, target, onOpenDetail }: SummaryCardProps) {
  const who = capitalize(getSubject(target));
  const tables = access.reasons.tables ?? [];
  const collectionCounts = countCollectionValues(access.collections);
  const tableCounts = countTableStatuses(tables, access.reasons);
  const openCount = collectionCounts.curate + collectionCounts.view;
  const viewCount = tableCounts.filtered + tableCounts["can-view"];
  const openText = ngettext(
    msgid`${openCount} collection`,
    `${openCount} collections`,
    openCount,
  );
  const viewText = ngettext(
    msgid`${viewCount} table`,
    `${viewCount} tables`,
    viewCount,
  );

  return (
    <SheetCard>
      <Stack gap="sm">
        <BodyText fw="bold">
          {t`${who} can open ${openText} and view ${viewText}.`}
        </BodyText>
        <Disclosure
          title={t`Collections (${access.collections.length})`}
          counts={getCollectionCounts(collectionCounts)}
        >
          {[...access.collections]
            .sort(
              (first, second) =>
                Number(first.value === "none") -
                Number(second.value === "none"),
            )
            .map((collection) => {
              const name = getCollectionName(collection, target);
              return (
                <Row key={collection["collection-id"]} name={name}>
                  <StatusButton
                    status={getCollectionStatus(collection.value)}
                    rowName={name}
                    onClick={() =>
                      onOpenDetail(
                        { kind: "collection", collection },
                        access.reasons,
                      )
                    }
                  />
                </Row>
              );
            })}
        </Disclosure>
        <Disclosure
          title={t`Tables (${tables.length})`}
          counts={getTableCounts(tableCounts)}
        >
          <TablesByStatus
            tables={tables}
            reasons={access.reasons}
            target={target}
            onOpenDetail={onOpenDetail}
          />
        </Disclosure>
      </Stack>
    </SheetCard>
  );
}

function getCollectionCounts({
  curate,
  view,
  none,
}: ReturnType<typeof countCollectionValues>) {
  return [
    curate > 0 && t`${curate} Curate`,
    view > 0 && t`${view} View`,
    none > 0 && t`${none} No access`,
  ]
    .filter(Boolean)
    .join(" · ");
}

function getTableCounts(counts: Record<TableStatus, number>) {
  return TABLE_STATUS_ORDER.filter((status) => counts[status] > 0)
    .map((status) => `${counts[status]} ${getTableStatusLabel(status, "list")}`)
    .join(" · ");
}

interface TablesByStatusProps {
  tables: PermissionDebugTable[];
  reasons: PermissionDebugReasons;
  target: PreviewTarget;
  onOpenDetail: ExplainAccessSummaryProps["onOpenDetail"];
}

/** Tables fold by status: one is its own row, two or more share a row that opens. */
function TablesByStatus({
  tables,
  reasons,
  target,
  onOpenDetail,
}: TablesByStatusProps) {
  const groups = TABLE_STATUS_ORDER.map((status) => ({
    status,
    ofStatus: tables.filter(
      (table) => getTableStatus(table, reasons) === status,
    ),
  }));
  const hasToggleRow = groups.some(
    ({ status, ofStatus }) =>
      ofStatus.length > 1 || (ofStatus.length === 1 && opensRules(status)),
  );

  return groups.map(({ status, ofStatus }) => {
    const rows = ofStatus.map((table) => (
      <TableRow
        key={table["table-id"]}
        table={table}
        status={status}
        reasons={reasons}
        target={target}
        hasChevronSlot={ofStatus.length === 1 && hasToggleRow}
        onOpen={() =>
          onOpenDetail(
            {
              kind: "table",
              tableId: table["table-id"],
              permission: "view-data",
            },
            reasons,
          )
        }
      />
    ));
    return (
      <Fragment key={status}>
        {ofStatus.length < 2 ? (
          rows
        ) : (
          <ToggleRow
            name={t`${ofStatus.length} tables`}
            status={<FoldStatus label={getTableStatusLabel(status, "list")} />}
            hasToggleRows={opensRules(status)}
          >
            {rows}
          </ToggleRow>
        )}
      </Fragment>
    );
  });
}

/** A table with a rule, working or failing, opens to what the rule says. */
function opensRules(status: TableStatus) {
  return status === "filtered" || status === "cant-load";
}

interface TableRowProps {
  table: PermissionDebugTable;
  status: TableStatus;
  reasons: PermissionDebugReasons;
  target: PreviewTarget;
  /** Beside a fold or a row that opens, in a row that doesn't */
  hasChevronSlot: boolean;
  onOpen: () => void;
}

function TableRow({
  table,
  status,
  reasons,
  target,
  hasChevronSlot,
  onOpen,
}: TableRowProps) {
  const button = (
    <StatusButton
      status={getTableStatusDisplay(status, "list")}
      rowName={table.name}
      onClick={onOpen}
    />
  );
  if (opensRules(status)) {
    return (
      <ToggleRow
        name={table.name}
        database={table["db-name"]}
        status={button}
        initiallyOpen
      >
        <TableRules table={table} reasons={reasons} target={target} />
      </ToggleRow>
    );
  }
  return (
    <Row
      name={table.name}
      database={table["db-name"]}
      hasChevronSlot={hasChevronSlot}
    >
      {button}
    </Row>
  );
}

export function SummaryHeading({ target }: { target: PreviewTarget }) {
  const subject = getSubject(target);

  return (
    <Flex gap="sm" align="center" wrap="nowrap">
      <Icon name="eye" c="text-secondary" flex="none" />
      <Text fw="bold" lh="1.25rem" truncate>
        {t`Everything ${subject} can access`}
      </Text>
    </Flex>
  );
}
