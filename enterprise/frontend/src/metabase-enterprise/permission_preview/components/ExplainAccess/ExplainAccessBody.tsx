import { type ReactNode, useState } from "react";
import { t } from "ttag";

import {
  Alert,
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
  PermissionDebugImpersonation,
  PermissionDebugTable,
} from "metabase-types/api";

import type { PreviewTarget } from "../types";

import { ExplainAccessDetail, type ExplainDetail } from "./ExplainAccessDetail";
import {
  type ExplainAnswers,
  type ExplainedItemType,
  type TableStatus,
  getConflictSentence,
  getItemNoun,
  getRouteSentence,
  getSourceText,
  getSubject,
  getTableStatus,
  getVerdict,
  groupTablesByValue,
} from "./explain";
import {
  getCollectionValueLabel,
  getCreateQueriesLabel,
  getDownloadLabel,
  getViewDataLabel,
} from "./labels";

interface ExplainAccessBodyProps {
  itemType: ExplainedItemType;
  target: PreviewTarget;
  answers: ExplainAnswers;
}

export function ExplainAccessBody({
  itemType,
  target,
  answers,
}: ExplainAccessBodyProps) {
  const [detail, setDetail] = useState<ExplainDetail | null>(null);
  const { read, query, download } = answers;
  const collection = read.reasons.collection ?? query?.reasons.collection;

  if (detail) {
    return (
      <ExplainAccessDetail
        detail={detail}
        target={target}
        query={query}
        collection={collection}
        onBack={() => setDetail(null)}
      />
    );
  }

  const verdict = getVerdict(itemType, getSubject(target), answers);
  const tables = query?.reasons.tables ?? [];
  const item = getItemNoun(itemType);

  return (
    <Stack gap="lg">
      <VerdictAlert tone={verdict.tone} text={verdict.text} />
      {query && <ConflictNotes query={query} />}
      {collection && (
        <Section
          title={
            itemType === "collection"
              ? t`Collection access`
              : t`Opening this ${item}`
          }
        >
          <Row
            label={t`Collection`}
            name={collection.name}
            status={getCollectionStatus(collection)}
            onClick={() => setDetail({ kind: "collection" })}
          />
        </Section>
      )}
      {query && tables.length > 0 && (
        <DataSection
          item={item}
          tables={tables}
          query={query}
          onOpen={(tableId) =>
            setDetail({ kind: "table", tableId, permission: "view-data" })
          }
        />
      )}
      {query && <ConnectionSection query={query} />}
      {query && tables.length > 0 && (
        <ExploringSection
          item={item}
          tables={tables}
          onOpen={(tableId) =>
            setDetail({ kind: "table", tableId, permission: "create-queries" })
          }
        />
      )}
      {query && tables.length > 0 && (
        <DownloadSection
          tables={tables}
          download={download}
          onOpen={(tableId) =>
            setDetail({
              kind: "table",
              tableId,
              permission: "download-results",
            })
          }
        />
      )}
      {itemType !== "collection" && collection && (
        <Section title={t`Editing this ${item}`}>
          <Text>
            {t`To edit this ${item}, they also need`}{" "}
            <Text component="span" fw="bold">{t`Curate`}</Text>{" "}
            {t`access to its collection.`}
          </Text>
        </Section>
      )}
      {query && (
        <AllPermissions
          item={item}
          collection={collection}
          tables={tables}
          onOpen={setDetail}
        />
      )}
    </Stack>
  );
}

interface VerdictAlertProps {
  tone: "success" | "warning" | "error";
  text: string;
}

function VerdictAlert({ tone, text }: VerdictAlertProps) {
  if (tone === "success") {
    return <Text fw="bold">{text}</Text>;
  }
  return (
    <Alert color={tone} icon={<Icon name="warning" />}>
      {text}
    </Alert>
  );
}

function ConflictNotes({ query }: { query: PermissionDebugAnswer }) {
  const sentences = (query.reasons.problems ?? []).flatMap((problem) => {
    const sentence = getConflictSentence(problem, query);
    return sentence ? [sentence] : [];
  });

  return (
    <>
      {sentences.map((sentence) => (
        <Text key={sentence}>{sentence}</Text>
      ))}
    </>
  );
}

interface SectionProps {
  title: string;
  children: ReactNode;
}

function Section({ title, children }: SectionProps) {
  return (
    <Stack gap="sm">
      <Text fw="bold">{title}</Text>
      {children}
    </Stack>
  );
}

interface RowProps {
  label?: string;
  name: string;
  status: string;
  detail?: ReactNode;
  onClick: () => void;
}

function Row({ label, name, status, detail, onClick }: RowProps) {
  return (
    <Stack gap="xs">
      <UnstyledButton onClick={onClick} aria-label={`${name}, ${status}`}>
        <Flex gap="sm" align="center" wrap="nowrap">
          {label && <Text c="text-secondary">{label}</Text>}
          <Text flex={1} miw={0} truncate>
            {name}
          </Text>
          <Text>{status}</Text>
          <Icon name="chevronright" size={12} />
        </Flex>
      </UnstyledButton>
      {detail}
    </Stack>
  );
}

function getCollectionStatus(collection: PermissionDebugCollection) {
  const label = getCollectionValueLabel(collection.value);
  if (collection["by-rule"]) {
    return t`${label} · by rule`;
  }
  const source = getSourceText(collection.groups);
  return source ? `${label} · ${source}` : label;
}

const TABLE_STATUS_ICONS: Record<TableStatus, string> = {
  blocked: "✕",
  "cant-load": "⚠",
  filtered: "◐",
  "can-view": "✓",
};

function getTableStatusLabel(status: TableStatus) {
  switch (status) {
    case "blocked":
      return t`Blocked`;
    case "cant-load":
      return t`Can't load`;
    case "filtered":
      return t`Rows filtered`;
    case "can-view":
      return t`Can view`;
  }
}

interface DataSectionProps {
  item: string;
  tables: PermissionDebugTable[];
  query: PermissionDebugAnswer;
  onOpen: (tableId: number) => void;
}

function DataSection({ item, tables, query, onOpen }: DataSectionProps) {
  const rows = tables.map((table) => ({
    table,
    status: getTableStatus(table, query),
  }));
  const viewable = rows.filter(({ status }) => status === "can-view");
  const limiting = rows.filter(({ status }) => status !== "can-view");
  const folds = viewable.length > 1;

  return (
    <Section title={t`Data in this ${item}`}>
      {limiting.map(({ table, status }) => (
        <Row
          key={table["table-id"]}
          name={table.name}
          status={`${TABLE_STATUS_ICONS[status]} ${getTableStatusLabel(status)}`}
          detail={<TableNotes table={table} status={status} query={query} />}
          onClick={() => onOpen(table["table-id"])}
        />
      ))}
      {folds ? (
        <Text c="text-secondary">
          {t`${viewable.length} tables · ${getTableStatusLabel("can-view")}`}
        </Text>
      ) : (
        viewable.map(({ table }) => (
          <Row
            key={table["table-id"]}
            name={table.name}
            status={`${TABLE_STATUS_ICONS["can-view"]} ${getTableStatusLabel("can-view")}`}
            onClick={() => onOpen(table["table-id"])}
          />
        ))
      )}
    </Section>
  );
}

interface TableNotesProps {
  table: PermissionDebugTable;
  status: TableStatus;
  query: PermissionDebugAnswer;
}

function TableNotes({ table, status, query }: TableNotesProps) {
  if (status === "cant-load") {
    const attributes = (query.reasons.problems ?? []).flatMap((problem) =>
      problem.type === "missing-attribute" ? [problem.attribute] : [],
    );
    return (
      <Box>
        {attributes.map((attribute) => (
          <Text key={attribute} c="feedback-negative-strong">
            {t`No value for ${attribute}. Set a value for ${attribute} to see this table.`}
          </Text>
        ))}
      </Box>
    );
  }
  const sandboxes = table.sandboxes.filter((sandbox) => sandbox["enforced?"]);
  return (
    <Stack gap="xs" pl="md">
      {sandboxes.map((sandbox) => (
        <Stack key={sandbox["sandbox-id"]} gap="xs">
          {sandbox.filters.map((filter) => (
            <Flex key={filter.attribute} gap="sm" align="center">
              <Badge>{`${filter.attribute} ${filter.value ?? ""}`}</Badge>
              <Text c="text-secondary">{`→ ${filter.column}`}</Text>
            </Flex>
          ))}
          <Text c="text-secondary" size="sm">
            {t`Rules set by ${sandbox["group-name"]}`}
          </Text>
        </Stack>
      ))}
    </Stack>
  );
}

interface ConnectionSectionProps {
  query: PermissionDebugAnswer;
}

function ConnectionSection({ query }: ConnectionSectionProps) {
  const impersonations = (query.reasons.impersonations ?? []).filter(
    (impersonation) => impersonation["enforced?"],
  );
  const routes = query.reasons.routes ?? [];

  if (impersonations.length === 0 && routes.length === 0) {
    return null;
  }
  return (
    <Section title={t`Connection`}>
      {routes.map((route) => (
        <Text key={`route-${route["db-id"]}`}>{getRouteSentence(route)}</Text>
      ))}
      {impersonations.map((impersonation) => (
        <Text key={`impersonation-${impersonation["db-id"]}`}>
          {getImpersonationSentence(impersonation)}
        </Text>
      ))}
    </Section>
  );
}

function getImpersonationSentence(impersonation: PermissionDebugImpersonation) {
  const database = impersonation["db-name"];
  return impersonation["missing?"]
    ? t`${database}: every query fails, there is no value for ${impersonation.attribute}.`
    : t`${database}: connects as the role ${impersonation.value}, set by ${impersonation.attribute}.`;
}

interface ExploringSectionProps {
  item: string;
  tables: PermissionDebugTable[];
  onOpen: (tableId: number) => void;
}

function ExploringSection({ item, tables, onOpen }: ExploringSectionProps) {
  const rows = groupTablesByValue(
    tables,
    (table) => table["create-queries"].value,
  );
  return (
    <Section title={t`Exploring this ${item}`}>
      {rows.map(({ value, tables: rowTables }) => {
        const source = getSourceText(rowTables[0]["create-queries"].groups);
        const label = getCreateQueriesLabel(value);
        return (
          <Row
            key={value}
            name={rowTables.map((table) => table.name).join(", ")}
            status={source ? `${label} · ${source}` : label}
            onClick={() => onOpen(rowTables[0]["table-id"])}
          />
        );
      })}
    </Section>
  );
}

interface DownloadSectionProps {
  tables: PermissionDebugTable[];
  download?: PermissionDebugAnswer;
  onOpen: (tableId: number) => void;
}

function DownloadSection({ tables, download, onOpen }: DownloadSectionProps) {
  return (
    <Section title={t`Downloading`}>
      {download && <Text>{getDownloadVerdict(download)}</Text>}
      {tables.map((table) => (
        <Row
          key={table["table-id"]}
          name={table.name}
          status={getDownloadLabel(table["download-results"].value)}
          onClick={() => onOpen(table["table-id"])}
        />
      ))}
    </Section>
  );
}

function getDownloadVerdict(download: PermissionDebugAnswer) {
  if (download.decision === "denied") {
    return t`They can't download these results.`;
  }
  if (download.decision === "limited") {
    return t`Their downloads are capped below the full result.`;
  }
  return t`They can download the full result.`;
}

interface AllPermissionsProps {
  item: string;
  collection?: PermissionDebugCollection;
  tables: PermissionDebugTable[];
  onOpen: (detail: ExplainDetail) => void;
}

function AllPermissions({
  item,
  collection,
  tables,
  onOpen,
}: AllPermissionsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const rows = [
    ...(collection
      ? [
          {
            key: "collection",
            name: t`${collection.name} · Collection access`,
            status: getCollectionValueLabel(collection.value),
            detail: { kind: "collection" } as const,
          },
        ]
      : []),
    ...tables.flatMap((table) => [
      {
        key: `${table["table-id"]}-view-data`,
        name: t`${table.name} · View data`,
        status: getViewDataLabel(table["view-data"].value),
        detail: {
          kind: "table",
          tableId: table["table-id"],
          permission: "view-data",
        } as const,
      },
      {
        key: `${table["table-id"]}-create-queries`,
        name: t`${table.name} · Create queries`,
        status: getCreateQueriesLabel(table["create-queries"].value),
        detail: {
          kind: "table",
          tableId: table["table-id"],
          permission: "create-queries",
        } as const,
      },
      {
        key: `${table["table-id"]}-download-results`,
        name: t`${table.name} · Download results`,
        status: getDownloadLabel(table["download-results"].value),
        detail: {
          kind: "table",
          tableId: table["table-id"],
          permission: "download-results",
        } as const,
      },
    ]),
  ];

  return (
    <Stack gap="sm">
      <UnstyledButton
        onClick={() => setIsOpen((current) => !current)}
        aria-expanded={isOpen}
      >
        <Flex gap="xs" align="center">
          <Icon name={isOpen ? "chevrondown" : "chevronright"} size={12} />
          <Text fw="bold">
            {t`All permissions on this ${item} (${rows.length})`}
          </Text>
        </Flex>
      </UnstyledButton>
      {isOpen &&
        rows.map((row) => (
          <Row
            key={row.key}
            name={row.name}
            status={row.status}
            onClick={() => onOpen(row.detail)}
          />
        ))}
    </Stack>
  );
}
