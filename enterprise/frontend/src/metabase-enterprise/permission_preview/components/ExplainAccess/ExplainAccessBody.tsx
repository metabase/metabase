import { Fragment } from "react";
import { jt, t } from "ttag";

import { Code, Flex, Stack } from "metabase/ui";
import type {
  PermissionDebugAnswer,
  PermissionDebugCollection,
  PermissionDebugDecision,
  PermissionDebugImpersonation,
  PermissionDebugReasons,
  PermissionDebugRoute,
  PermissionDebugSqlCard,
  PermissionDebugTable,
} from "metabase-types/api";

import { AttributeTag } from "../AttributeChip";
import type { PreviewTarget } from "../types";

import type { ExplainDetail } from "./ExplainAccessDetail";
import {
  BodyText,
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
  getSourceText,
  getSqlCardsToWarnAbout,
  getSubject,
  getTableProblemNotes,
  getTableStatusDisplay,
  getVerdict,
  groupTablesByValue,
  sortTablesByStatus,
} from "./explain";
import {
  getCollectionStatus,
  getCreateQueriesStatus,
  getDownloadStatus,
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
          isDashboard={itemType === "dashboard"}
          tables={tables}
          reasons={reasons}
          target={target}
          onOpen={(tableId) =>
            onOpenDetail({ kind: "table", tableId, permission: "view-data" })
          }
        />
      )}
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
  isDashboard: boolean;
  tables: PermissionDebugTable[];
  reasons: PermissionDebugReasons;
  target: PreviewTarget;
  onOpen: (tableId: number) => void;
}

function DataCard({
  item,
  isDashboard,
  tables,
  reasons,
  target,
  onOpen,
}: DataCardProps) {
  const sqlCards = getSqlCardsToWarnAbout(reasons);
  const rows = sortTablesByStatus(tables, reasons).map(({ table, status }) => {
    if (
      !isDashboard &&
      sqlCards.length > 0 &&
      status === "filtered" &&
      !reasons.impersonations?.some(
        (impersonation) =>
          impersonation["db-id"] === table["db-id"] &&
          impersonation["enforced?"],
      )
    ) {
      return { table, status: "can-view" as const };
    }
    return { table, status };
  });
  const ofStatus = (...statuses: TableStatus[]) =>
    rows.filter(({ status }) => statuses.includes(status));
  const blocked = ofStatus("blocked");
  const opening = ofStatus("cant-load", "filtered");
  const viewable = ofStatus("can-view");
  const hasOnlyTable = rows.length === 1;
  const hasToggleRow =
    (opening.length > 0 && !hasOnlyTable) ||
    blocked.length > 1 ||
    viewable.length > 1 ||
    (isDashboard && sqlCards.length > 1);

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
      {opening.map(({ table, status }) => {
        const statusButton = (
          <StatusButton
            status={getTableStatusDisplay(status)}
            rowName={table.name}
            onClick={() => onOpen(table["table-id"])}
          />
        );
        const tableRules = (
          <TableRules table={table} reasons={reasons} target={target} />
        );
        // A lone table has nothing to fold away from: its rules stay shown
        return hasOnlyTable ? (
          <Fragment key={table["table-id"]}>
            <Row name={table.name} database={table["db-name"]}>
              {statusButton}
            </Row>
            {tableRules}
          </Fragment>
        ) : (
          <ToggleRow
            key={table["table-id"]}
            name={table.name}
            database={table["db-name"]}
            initiallyOpen
            status={statusButton}
          >
            {tableRules}
          </ToggleRow>
        );
      })}
      <TableRows
        rows={viewable}
        hasChevronSlot={hasToggleRow}
        onOpen={onOpen}
        reasons={reasons}
        target={target}
      />
      {sqlCards.length > 0 && (
        <>
          {isDashboard && (
            <SqlCardRows cards={sqlCards} hasChevronSlot={hasToggleRow} />
          )}
          <BodyText c="text-secondary" py="sm">
            {t`Row and column security never applies to SQL questions.`}
          </BodyText>
        </>
      )}
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
function TableRows({ rows, hasChevronSlot, reasons, onOpen }: TableRowsProps) {
  if (rows.length === 0) {
    return null;
  }
  const items = rows.map(({ table, status }) => (
    <Row
      key={table["table-id"]}
      name={table.name}
      database={table["db-name"]}
      detail={getSourceText(table["view-data"].groups)}
      note={getConnectionNotes(table, reasons)}
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
  return (
    <ToggleRow
      name={t`${rows.length} tables`}
      summary={<PlainStatus status={getTableStatusDisplay(rows[0].status)} />}
    >
      {items}
    </ToggleRow>
  );
}

interface SqlCardRowsProps {
  cards: PermissionDebugSqlCard[];
  hasChevronSlot: boolean;
}

/** A dashboard's SQL cards: two or more fold into a row; one stays its own row. */
function SqlCardRows({ cards, hasChevronSlot }: SqlCardRowsProps) {
  // The rows inside have no status of their own, so this stays visible when open
  const status = (
    <PlainStatus
      status={{
        label: t`Full access`,
        icon: "eye",
        color: "feedback-positive",
      }}
    />
  );
  if (cards.length === 1) {
    return (
      <Row name={cards[0].name} hasChevronSlot={hasChevronSlot}>
        {status}
      </Row>
    );
  }
  return (
    <ToggleRow name={t`${cards.length} SQL cards`} status={status}>
      {cards.map((card) => (
        <Row key={card["card-id"]} name={card.name} />
      ))}
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
      {getConnectionNotes(table, reasons)}
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

/** How a table's database connects for this person: impersonation or database routing */
function getConnectionNotes(
  table: PermissionDebugTable,
  reasons: PermissionDebugReasons,
) {
  const impersonations = (reasons.impersonations ?? []).filter(
    (impersonation) =>
      impersonation["db-id"] === table["db-id"] && impersonation["enforced?"],
  );
  const routes = (reasons.routes ?? []).filter(
    (route) => route["db-id"] === table["db-id"],
  );
  return [
    ...routes.map((route) => (
      <BodyText key={`route-${route["db-id"]}`}>
        {getRouteSentence(route)}
      </BodyText>
    )),
    ...impersonations.map((impersonation) => (
      <BodyText key={`impersonation-${impersonation["db-id"]}`}>
        {getImpersonationSentence(impersonation)}
      </BodyText>
    )),
  ];
}

/** Values from the data go in code, so what is fixed text and what is a value is clear */
function getImpersonationSentence(impersonation: PermissionDebugImpersonation) {
  const attribute = <Code key="attribute">{impersonation.attribute}</Code>;
  const role = <Code key="role">{impersonation.value}</Code>;
  return impersonation["missing?"]
    ? jt`Impersonation: every query fails, because there is no value for ${attribute}.`
    : jt`Impersonation: connects as the role ${role}, set by ${attribute}.`;
}

function getRouteSentence(route: PermissionDebugRoute) {
  const attribute = <Code key="attribute">{route.attribute}</Code>;
  const value = <Code key="value">{route.value}</Code>;
  const destination = (
    <Code key="destination">{route["destination-name"]}</Code>
  );
  switch (route.status) {
    case "routed":
      return jt`Database routing: queries go to ${destination}, picked by ${attribute} = ${value}.`;
    case "router":
      return jt`Database routing: queries stay on this database (${attribute} = ${value}).`;
    case "missing-value":
      return jt`Database routing: every query fails, because there is no value for ${attribute}.`;
    case "no-destination":
      return jt`Database routing: every query fails, because no database is named ${value}.`;
  }
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
  const [first] = values;
  const rows = tables.map((table) => (
    <Row
      key={table["table-id"]}
      name={table.name}
      database={table["db-name"]}
      detail={getSourceText(table["create-queries"].groups)}
    >
      <StatusButton
        status={getCreateQueriesStatus(table["create-queries"].value)}
        rowName={table.name}
        onClick={() => onOpen(table["table-id"])}
      />
    </Row>
  ));

  return (
    <SheetCard
      title={t`Exploring this ${item}`}
      info={{
        label: t`About Create queries`,
        text: t`Create queries on each table decides whether the person can explore the ${item}'s results or start a new question from those results.`,
      }}
    >
      {tables.length === 1 ? (
        rows
      ) : (
        <ToggleRow
          name={t`${tables.length} tables`}
          summary={
            values.length === 1 ? (
              <PlainStatus status={getCreateQueriesStatus(first.value)} />
            ) : (
              <BodyText c="text-secondary" flex="none">
                {t`Varies by table`}
              </BodyText>
            )
          }
        >
          {rows}
        </ToggleRow>
      )}
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
        summary={
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
