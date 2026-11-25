import { t } from "ttag";

import { Flex, Stack } from "metabase/ui";
import type {
  PermissionDebugAnswer,
  PermissionDebugCollection,
  PermissionDebugDecision,
  PermissionDebugImpersonation,
  PermissionDebugReasons,
  PermissionDebugTable,
} from "metabase-types/api";

import { AttributeTag } from "../AttributeChip";
import type { PreviewTarget } from "../types";

import type { ExplainDetail } from "./ExplainAccessDetail";
import {
  BodyText,
  FoldStatus,
  PlainStatus,
  Row,
  SheetCard,
  SmallText,
  StatusButton,
  SummaryLink,
  ToggleRow,
  VerdictView,
} from "./ExplainAccessParts";
import {
  type ExplainAnswers,
  type ExplainedItemType,
  type TableStatus,
  getCollectionName,
  getItemNoun,
  getRouteSentence,
  getSourceText,
  getSubject,
  getTableProblemNotes,
  getTableStatusDisplay,
  getTableStatusLabel,
  getVerdict,
  groupTablesByValue,
  sortTablesByStatus,
} from "./explain";
import {
  type ValueStatus,
  getCollectionStatus,
  getCreateQueriesStatus,
  getDownloadStatus,
  getViewDataStatus,
} from "./labels";

interface ExplainAccessBodyProps {
  itemType: ExplainedItemType;
  target: PreviewTarget;
  answers: ExplainAnswers;
  onOpenDetail: (detail: ExplainDetail) => void;
  onOpenSummary: () => void;
}

export function ExplainAccessBody({
  itemType,
  target,
  answers,
  onOpenDetail,
  onOpenSummary,
}: ExplainAccessBodyProps) {
  const { read, query, download } = answers;
  const collection = read.reasons.collection ?? query?.reasons.collection;
  const subject = getSubject(target);
  const verdict = getVerdict(itemType, subject, answers);
  const item = getItemNoun(itemType);
  const reasons = query?.reasons;
  const tables = reasons?.tables ?? [];

  return (
    <Stack gap="xl">
      <VerdictView verdict={verdict} />
      {collection && (
        <OpeningCard
          item={item}
          collection={collection}
          target={target}
          onOpen={() => onOpenDetail({ kind: "collection", collection })}
        />
      )}
      {query && reasons && tables.length > 0 && (
        <DataCard
          item={item}
          tables={tables}
          reasons={reasons}
          target={target}
          onOpen={(tableId) =>
            onOpenDetail({ kind: "table", tableId, permission: "view-data" })
          }
        />
      )}
      {reasons && <ConnectionCard reasons={reasons} />}
      {tables.length > 0 && (
        <ExploringCard
          item={item}
          tables={tables}
          onOpen={(tableId) =>
            onOpenDetail({
              kind: "table",
              tableId,
              permission: "create-queries",
            })
          }
        />
      )}
      {download && (
        <DownloadCard
          tables={tables}
          download={download}
          onOpen={(tableId) =>
            onOpenDetail({
              kind: "table",
              tableId,
              permission: "download-results",
            })
          }
        />
      )}
      {query && (
        <AllPermissionsCard
          isQuestion={itemType === "question"}
          collection={collection}
          tables={tables}
          target={target}
          onOpen={onOpenDetail}
        />
      )}
      <SummaryLink subject={subject} onClick={onOpenSummary} />
    </Stack>
  );
}

interface OpeningCardProps {
  item: string;
  collection: PermissionDebugCollection;
  target: PreviewTarget;
  onOpen: () => void;
}

function OpeningCard({ item, collection, target, onOpen }: OpeningCardProps) {
  const name = getCollectionName(collection, target);
  const source = collection["by-rule"]
    ? t`by rule`
    : getSourceText(collection.groups);

  return (
    <SheetCard
      title={t`Opening this ${item}`}
      info={{
        label: t`About collection permissions`,
        text: t`${capitalizePlural(item)} don't have their own permissions. Anyone who can see the ${item}'s collection can open the ${item}.`,
      }}
    >
      <Row
        label={t`Collection`}
        name={name}
        detail={collection.value === "none" ? null : source}
      >
        <StatusButton
          status={getCollectionStatus(collection.value)}
          rowName={name}
          onClick={onOpen}
        />
      </Row>
    </SheetCard>
  );
}

function capitalizePlural(item: string) {
  const plural = `${item}s`;
  return plural.charAt(0).toUpperCase() + plural.slice(1);
}

interface DataCardProps {
  item: string;
  tables: PermissionDebugTable[];
  reasons: PermissionDebugReasons;
  target: PreviewTarget;
  onOpen: (tableId: number) => void;
}

function DataCard({ item, tables, reasons, target, onOpen }: DataCardProps) {
  const rows = sortTablesByStatus(tables, reasons);
  const ofStatus = (...statuses: TableStatus[]) =>
    rows.filter(({ status }) => statuses.includes(status));
  const blocked = ofStatus("blocked");
  const opening = ofStatus("cant-load", "filtered");
  const viewable = ofStatus("can-view");
  const hasToggleRow =
    opening.length > 0 || blocked.length > 1 || viewable.length > 1;

  return (
    <SheetCard
      title={t`Data in this ${item}`}
      info={{
        label: t`About View data`,
        text: t`View data on each table decides whether the ${item}'s results load. Row and column security shows only the rows that match the person's user attributes.`,
      }}
    >
      <TableRows
        rows={blocked}
        hasChevronSlot={hasToggleRow}
        onOpen={onOpen}
        reasons={reasons}
        target={target}
      />
      {opening.map(({ table, status }) => (
        <ToggleRow
          key={table["table-id"]}
          name={table.name}
          database={table["db-name"]}
          initiallyOpen
          status={
            <StatusButton
              status={getTableStatusDisplay(status)}
              rowName={table.name}
              onClick={() => onOpen(table["table-id"])}
            />
          }
        >
          <TableRules table={table} reasons={reasons} target={target} />
        </ToggleRow>
      ))}
      <TableRows
        rows={viewable}
        hasChevronSlot={hasToggleRow}
        onOpen={onOpen}
        reasons={reasons}
        target={target}
      />
    </SheetCard>
  );
}

interface TableRowsProps {
  rows: { table: PermissionDebugTable; status: TableStatus }[];
  hasChevronSlot: boolean;
  reasons: PermissionDebugReasons;
  target: PreviewTarget;
  onOpen: (tableId: number) => void;
}

/** Two or more tables with one status fold into a row; one stays its own row. */
function TableRows({ rows, hasChevronSlot, onOpen }: TableRowsProps) {
  if (rows.length === 0) {
    return null;
  }
  const items = rows.map(({ table, status }) => (
    <Row
      key={table["table-id"]}
      name={table.name}
      database={table["db-name"]}
      detail={getSourceText(table["view-data"].groups)}
      hasChevronSlot={rows.length === 1 && hasChevronSlot}
    >
      <StatusButton
        status={getTableStatusDisplay(status)}
        rowName={table.name}
        onClick={() => onOpen(table["table-id"])}
      />
    </Row>
  ));
  if (rows.length === 1) {
    return items;
  }
  const label = getTableStatusLabel(rows[0].status);
  return (
    <ToggleRow
      name={t`${rows.length} tables`}
      status={<FoldStatus label={label} />}
    >
      {items}
    </ToggleRow>
  );
}

interface TableRulesProps {
  table: PermissionDebugTable;
  reasons: PermissionDebugReasons;
  target: PreviewTarget;
}

/** What a table's rule says: why it fails, one line per attribute, and who set it. */
export function TableRules({ table, reasons, target }: TableRulesProps) {
  const notes = getTableProblemNotes(table, reasons, target);
  const sandboxes = table.sandboxes.filter((sandbox) => sandbox["enforced?"]);
  const groups = [
    ...new Set(sandboxes.map((sandbox) => sandbox["group-name"])),
  ];

  return (
    <Stack gap="sm">
      {notes.map((note) => (
        <BodyText key={note}>{note}</BodyText>
      ))}
      {sandboxes.flatMap((sandbox) =>
        sandbox.filters.map((filter) => (
          <Flex
            key={`${sandbox["sandbox-id"]}-${filter.attribute}`}
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
        )),
      )}
      {groups.length > 0 && (
        <SmallText>{t`Rules set by ${groups.join(", ")}`}</SmallText>
      )}
    </Stack>
  );
}

function ConnectionCard({ reasons }: { reasons: PermissionDebugReasons }) {
  const impersonations = (reasons.impersonations ?? []).filter(
    (impersonation) => impersonation["enforced?"],
  );
  const routes = reasons.routes ?? [];

  if (impersonations.length === 0 && routes.length === 0) {
    return null;
  }
  return (
    <SheetCard title={t`Connection`}>
      <Stack gap="sm" py="sm">
        {routes.map((route) => (
          <BodyText key={`route-${route["db-id"]}`}>
            {getRouteSentence(route)}
          </BodyText>
        ))}
        {impersonations.map((impersonation) => (
          <BodyText key={`impersonation-${impersonation["db-id"]}`}>
            {getImpersonationSentence(impersonation)}
          </BodyText>
        ))}
      </Stack>
    </SheetCard>
  );
}

function getImpersonationSentence(impersonation: PermissionDebugImpersonation) {
  const database = impersonation["db-name"];
  return impersonation["missing?"]
    ? t`${database}: every query fails: no value for ${impersonation.attribute}.`
    : t`${database}: connects as the role ${impersonation.value}, set by ${impersonation.attribute}.`;
}

interface ExploringCardProps {
  item: string;
  tables: PermissionDebugTable[];
  onOpen: (tableId: number) => void;
}

function ExploringCard({ item, tables, onOpen }: ExploringCardProps) {
  const values = groupTablesByValue(
    tables,
    (table) => table["create-queries"].value,
  );
  const names = tables.map((table) => table.name).join(", ");
  const [first] = values;
  const isShared = values.length === 1;

  return (
    <SheetCard
      title={t`Exploring this ${item}`}
      info={{
        label: t`About Create queries`,
        text: t`Create queries on each table decides whether the person can explore the ${item}'s results or start a new question from those results.`,
      }}
    >
      <Row
        name={names}
        tooltip={tables
          .map((table) => `${table.name} · ${table["db-name"]}`)
          .join(", ")}
        detail={
          isShared
            ? getSourceText(first.tables[0]["create-queries"].groups)
            : null
        }
      >
        <StatusButton
          status={
            isShared
              ? getCreateQueriesStatus(first.value)
              : {
                  label: t`Varies by table`,
                  icon: "permissions_limited",
                  color: "feedback-warning",
                }
          }
          rowName={names}
          onClick={() => onOpen(first.tables[0]["table-id"])}
        />
      </Row>
    </SheetCard>
  );
}

interface DownloadCardProps {
  tables: PermissionDebugTable[];
  download: PermissionDebugAnswer;
  onOpen: (tableId: number) => void;
}

function DownloadCard({ tables, download, onOpen }: DownloadCardProps) {
  return (
    <SheetCard>
      <ToggleRow
        name={t`Download`}
        status={
          <PlainStatus
            status={getDownloadStatus(DOWNLOAD_VALUES[download.decision])}
          />
        }
      >
        <BodyText py="sm">{getDownloadVerdict(download)}</BodyText>
        {tables.map((table) => (
          <Row
            key={table["table-id"]}
            name={table.name}
            database={table["db-name"]}
          >
            <StatusButton
              status={getDownloadStatus(table["download-results"].value)}
              rowName={table.name}
              onClick={() => onOpen(table["table-id"])}
            />
          </Row>
        ))}
      </ToggleRow>
    </SheetCard>
  );
}

/** The download level that says what the whole question's download comes to */
const DOWNLOAD_VALUES: Record<PermissionDebugDecision, string> = {
  allow: "one-million-rows",
  limited: "ten-thousand-rows",
  denied: "no",
};

function getDownloadVerdict(download: PermissionDebugAnswer) {
  if (download.decision === "denied") {
    return t`They can't download these results.`;
  }
  if (download.decision === "limited") {
    return t`Their downloads are capped below the full result.`;
  }
  return t`They can download the full result.`;
}

interface AllPermissionsCardProps {
  isQuestion: boolean;
  collection?: PermissionDebugCollection;
  tables: PermissionDebugTable[];
  target: PreviewTarget;
  onOpen: (detail: ExplainDetail) => void;
}

interface PermissionRow {
  key: string;
  name: string;
  /** A table's database, which the tooltip of its cut-off row names */
  database?: string;
  status: ValueStatus;
  detail: ExplainDetail;
}

function AllPermissionsCard({
  isQuestion,
  collection,
  tables,
  target,
  onOpen,
}: AllPermissionsCardProps) {
  const rows: PermissionRow[] = [
    ...(collection
      ? [
          {
            key: "collection",
            name: t`${getCollectionName(collection, target)} · Collection access`,
            status: getCollectionStatus(collection.value),
            detail: { kind: "collection", collection } as const,
          },
        ]
      : []),
    ...tables.flatMap((table): PermissionRow[] => [
      {
        key: `${table["table-id"]}-view-data`,
        name: t`${table.name} · View data`,
        database: table["db-name"],
        status: getViewDataStatus(table["view-data"].value),
        detail: {
          kind: "table",
          tableId: table["table-id"],
          permission: "view-data",
        },
      },
      {
        key: `${table["table-id"]}-create-queries`,
        name: t`${table.name} · Create queries`,
        database: table["db-name"],
        status: getCreateQueriesStatus(table["create-queries"].value),
        detail: {
          kind: "table",
          tableId: table["table-id"],
          permission: "create-queries",
        },
      },
      ...(isQuestion
        ? [
            {
              key: `${table["table-id"]}-download-results`,
              name: t`${table.name} · Download results`,
              database: table["db-name"],
              status: getDownloadStatus(table["download-results"].value),
              detail: {
                kind: "table",
                tableId: table["table-id"],
                permission: "download-results",
              } as const,
            },
          ]
        : []),
    ]),
  ];

  const shownCount = (collection ? 1 : 0) + tables.length + 1;

  if (rows.length <= shownCount) {
    return null;
  }
  return (
    <SheetCard>
      <ToggleRow name={t`All permissions (${rows.length})`} status={null}>
        {rows.map((row) => (
          <Row
            key={row.key}
            name={row.name}
            tooltip={row.database && `${row.name} · ${row.database}`}
          >
            <StatusButton
              status={row.status}
              rowName={row.name}
              onClick={() => onOpen(row.detail)}
            />
          </Row>
        ))}
      </ToggleRow>
    </SheetCard>
  );
}
