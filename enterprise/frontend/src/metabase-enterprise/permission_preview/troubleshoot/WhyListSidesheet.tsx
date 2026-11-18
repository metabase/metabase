import {
  type ReactNode,
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { msgid, ngettext, t } from "ttag";

import {
  Sidesheet,
  SidesheetCard,
  SidesheetCardSection,
} from "metabase/common/components/Sidesheet";
import { useUniqueId } from "metabase/common/hooks/use-unique-id";
import type { PermissionOption } from "metabase/permissions";
import {
  Alert,
  Box,
  Button,
  Collapse,
  Flex,
  Icon,
  Loader,
  Stack,
  Text,
  Title,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";
import type { IconName } from "metabase-types/api";

import { CreateQueriesContent } from "./CreateQueriesContent";
import { TargetName } from "./TargetName";
import S from "./WhyListSidesheet.module.css";
import {
  SecurityRows,
  WhyContent,
  type WhyTarget,
  getSourceGroupName,
  getWhyValueLabel,
} from "./WhySidesheet";
import type { OpenedItem } from "./item-path";
import { getPreviewColumnName, getPreviewOption } from "./preview-options";
import {
  type AllCollectionsWhyPage,
  type BlockedCard,
  type CollectionWhyPage,
  type ItemType,
  type ItemWhyPage,
  type SummaryWhyPage,
  type WhyPreview,
  type WhyVerdict,
  useWhyList,
} from "./use-why-list";

type WhyListSidesheetProps = {
  isOpen: boolean;
  /** Null until the preview has started. */
  preview: WhyPreview | null;
  whoName: string;
  /** `whoName` at the start of a sentence: "A member of Sales" for "a member of Sales". */
  sentenceWhoName: string;
  /** The item the page shows now; the sheet follows it while open. */
  openedItem: OpenedItem | null;
  /** Whether the page shows its collection browser's top, "All collections", rather than a page with no item. */
  isAllCollections?: boolean;
  /** A panel in the page's own row, beside the frame, instead of a sheet over it. */
  isInPage?: boolean;
  onClose: () => void;
};

/** What the sheet shows over the page's answer, each with a way back. */
type SheetView =
  | { kind: "detail"; target: WhyTarget }
  | { kind: "explore"; targets: WhyTarget[] }
  | { kind: "summary" };

/**
 * What the person did in the sheet for one item: the views opened over the page, each with the scroll position to go
 * back to, and the rows they unfolded or folded.
 */
type SheetState = {
  itemKey: string;
  stack: { view: SheetView; scrollTopBelow: number }[];
  openRows: Record<string, boolean>;
};

/** Which rows are unfolded, kept by the sheet so they stay as they were after opening a detail and coming back. */
const OpenRowsContext = createContext<{
  openRows: Record<string, boolean>;
  onToggle: (rowKey: string, isOpen: boolean) => void;
}>({ openRows: {}, onToggle: () => undefined });

/**
 * "Explain access": answers whether the person can open the page shown, then shows only what decides it (what blocks,
 * what filters, why it opens), with every permission on it folded away; on "All collections" and Our analytics, the
 * collections the page lists; with no item open, their whole access. Each row opens the per-value "why" of the
 * permission tabs.
 */
export function WhyListSidesheet({
  isOpen,
  preview,
  whoName,
  sentenceWhoName,
  openedItem,
  isAllCollections = false,
  isInPage = false,
  onClose,
}: WhyListSidesheetProps) {
  const list = useWhyList(
    isOpen ? preview : null,
    openedItem,
    sentenceWhoName,
    isAllCollections,
  );
  const itemKey =
    openedItem != null
      ? `${openedItem.type}-${openedItem.id}`
      : isAllCollections
        ? "all-collections"
        : "none";
  const [sheetState, setSheetState] = useState<SheetState>(() =>
    getEmptySheetState(itemKey),
  );
  // closing the sheet or opening another item forgets what was opened in it
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen || itemKey !== sheetState.itemKey) {
    setWasOpen(isOpen);
    if (!isOpen || itemKey !== sheetState.itemKey) {
      setSheetState(getEmptySheetState(itemKey));
    }
  }
  const { stack, openRows } = sheetState;
  const view = stack.at(-1)?.view ?? null;

  const contentRef = useRef<HTMLDivElement>(null);
  const scrollTopToRestoreRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    const container = contentRef.current?.parentElement;
    if (container != null && scrollTopToRestoreRef.current != null) {
      container.scrollTop = scrollTopToRestoreRef.current;
      scrollTopToRestoreRef.current = null;
    }
  });

  const openView = (next: SheetView) => {
    const scrollTopBelow = contentRef.current?.parentElement?.scrollTop ?? 0;
    scrollTopToRestoreRef.current = 0;
    setSheetState({
      itemKey,
      stack: [...stack, { view: next, scrollTopBelow }],
      openRows,
    });
  };
  const handleOpenTarget = (target: WhyTarget) =>
    openView({ kind: "detail", target });
  const handleBack = () => {
    scrollTopToRestoreRef.current = stack.at(-1)?.scrollTopBelow ?? null;
    setSheetState({ itemKey, stack: stack.slice(0, -1), openRows });
  };
  const handleToggleRow = (rowKey: string, isRowOpen: boolean) =>
    setSheetState({
      itemKey,
      stack,
      openRows: { ...openRows, [rowKey]: isRowOpen },
    });
  const handleClose = () => {
    setSheetState(getEmptySheetState(itemKey));
    onClose();
  };

  const page = list?.page ?? null;
  const isSummary = view?.kind === "summary" || (list != null && page == null);

  const heading = list != null ? getSheetHeading(view, page, whoName) : null;
  const summaryLink = (
    <SummaryLink
      whoName={whoName}
      onClick={() => openView({ kind: "summary" })}
    />
  );

  const title = <SheetTitle hasBack={view != null} onBack={handleBack} />;
  const content = (
    // the sheet's own gap, so the scroll container stays this box's parent
    <Stack gap="xl" ref={contentRef}>
      <OpenRowsContext.Provider value={{ openRows, onToggle: handleToggleRow }}>
        {heading != null && <ItemLine {...heading} />}
        {view?.kind === "detail" ? (
          <WhyContent target={view.target} />
        ) : view?.kind === "explore" ? (
          <CreateQueriesContent targets={view.targets} />
        ) : list == null ? (
          <Loader />
        ) : isSummary ? (
          <SummaryCard summary={list.summary} onOpen={handleOpenTarget} />
        ) : page?.kind === "item" ? (
          <>
            <ItemCards
              page={page}
              onOpen={handleOpenTarget}
              onOpenExplore={(targets) =>
                openView({ kind: "explore", targets })
              }
            />
            {summaryLink}
          </>
        ) : page?.kind === "collection" ? (
          <>
            <CollectionVerdict page={page} onOpen={handleOpenTarget} />
            <CollectionList
              targets={page.collections}
              onOpen={handleOpenTarget}
            />
            {summaryLink}
          </>
        ) : page?.kind === "all-collections" ? (
          <>
            <CollectionList
              targets={page.collections}
              onOpen={handleOpenTarget}
            />
            {summaryLink}
          </>
        ) : null}
      </OpenRowsContext.Provider>
    </Stack>
  );

  if (isInPage) {
    return isOpen ? (
      <InPagePanel title={title} onClose={handleClose}>
        {content}
      </InPagePanel>
    ) : null;
  }
  return (
    <Sidesheet
      title={title}
      isOpen={isOpen}
      onClose={handleClose}
      withOverlay={false}
      isModal={false}
    >
      {content}
    </Sidesheet>
  );
}

/** The sheet as a column at the right of the page's row, at Permissions help's width, pushing the frame aside. */
function InPagePanel({
  title,
  onClose,
  children,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useUniqueId();
  return (
    <Flex
      component="aside"
      className={S.panel}
      direction="column"
      w="20rem"
      aria-labelledby={titleId}
    >
      <Flex align="center" justify="space-between" px="lg" pt="lg" pb="md">
        <Title id={titleId} order={4}>
          {title}
        </Title>
        <Button
          variant="subtle"
          size="compact-sm"
          c="text-primary"
          aria-label={t`Close`}
          leftSection={<Icon name="close" />}
          onClick={onClose}
        />
      </Flex>
      {/* the scroll container is the content's parent, as in the sheet */}
      <Box flex={1} mih={0} px="lg" pb="lg" className={S.panelBody}>
        {children}
      </Box>
    </Flex>
  );
}

function getEmptySheetState(itemKey: string): SheetState {
  return { itemKey, stack: [], openRows: {} };
}

/** A row's unfolded state, kept by the sheet; `rowKey` names the row among the sheet's other rows. */
function useOpenRow(rowKey: string, initiallyOpen: boolean) {
  const { openRows, onToggle } = useContext(OpenRowsContext);
  const isOpen = openRows[rowKey] ?? initiallyOpen;
  return [isOpen, () => onToggle(rowKey, !isOpen)] as const;
}

/** Always "Explain access"; a view opened over the page adds Back. */
function SheetTitle({
  hasBack,
  onBack,
}: {
  hasBack: boolean;
  onBack: () => void;
}) {
  if (!hasBack) {
    return t`Explain access`;
  }
  return (
    <Flex align="center" gap="xs">
      <Button
        size="compact-sm"
        variant="subtle"
        aria-label={t`Back`}
        leftSection={<Icon name="chevronleft" />}
        onClick={onBack}
      />
      {t`Explain access`}
    </Flex>
  );
}

type SheetHeading = {
  icon: IconName;
  name: string;
  /** A table's database, dimmed after the name. */
  databaseName?: string;
  /** The person the sheet explains, after the name; none where the name already says it. */
  whoName?: string;
};

/** What the sheet explains: the view opened over the page, else the page's item, collection or list. */
function getSheetHeading(
  view: SheetView | null,
  page: ItemWhyPage | CollectionWhyPage | AllCollectionsWhyPage | null,
  whoName: string,
): SheetHeading | null {
  if (view?.kind === "detail") {
    return {
      icon: view.target.column === "collection" ? "folder" : "table",
      name: view.target.title,
      databaseName: view.target.databaseName,
      whoName,
    };
  }
  if (view?.kind === "explore") {
    return {
      icon: "table",
      name: getPreviewColumnName("create_queries"),
      whoName,
    };
  }
  if (view?.kind === "summary" || page == null) {
    return { icon: "eye", name: t`Everything ${whoName} can access` };
  }
  switch (page.kind) {
    case "item":
      return { icon: ITEM_ICONS[page.itemType], name: page.name, whoName };
    case "collection":
      return { icon: "folder", name: page.name ?? t`This page`, whoName };
    case "all-collections":
      return { icon: "folder", name: t`All collections`, whoName };
  }
}

const ITEM_ICONS: Record<ItemType, IconName> = {
  dashboard: "dashboard",
  question: "table2",
  model: "model",
  metric: "metric",
};

/** One line under the title: the item's icon and name, which truncates, a table's database, then "as {name}". */
function ItemLine({ icon, name, databaseName, whoName }: SheetHeading) {
  return (
    <Flex align="center" gap="xs" wrap="nowrap" miw={0}>
      <Icon name={icon} c="text-secondary" style={{ flexShrink: 0 }} />
      <Tooltip label={name}>
        <Text fw="bold" truncate="end" miw={0}>
          {name}
        </Text>
      </Tooltip>
      {databaseName != null && (
        <Text size="sm" c="text-secondary" truncate="end" miw={0}>
          {`· ${databaseName}`}
        </Text>
      )}
      {whoName != null && (
        <Text size="sm" c="text-secondary" style={{ flexShrink: 0 }}>
          {t`as ${whoName}`}
        </Text>
      )}
    </Flex>
  );
}

/**
 * The verdict, then one card per answer: the cards that can't load, opening the item (its collection), its data (View
 * data on each table) and exploring it (Create queries); then every permission on it, folded away, when that list
 * holds more than the cards above show.
 */
function ItemCards({
  page,
  onOpen,
  onOpenExplore,
}: {
  page: ItemWhyPage;
  onOpen: (target: WhyTarget) => void;
  onOpenExplore: (targets: WhyTarget[]) => void;
}) {
  const copy = getItemSectionsCopy(page.itemType, page.permissions.length);
  // the explore card is one row for every table, so it shows every value only when there's one table
  const shownRowCount =
    (page.collection != null ? 1 : 0) +
    page.tables.length +
    (page.explore.length > 0 ? 1 : 0);
  const hasMorePermissions = page.permissions.length > shownRowCount;
  return (
    <>
      {page.verdict.kind === "blocked" ? (
        <VerdictAlert verdict={page.verdict} />
      ) : (
        <Verdict verdict={page.verdict} />
      )}
      {page.blockedCards.length > 0 && (
        <SidesheetCard title={t`Cards that can't load`}>
          <Box>
            {page.blockedCards.map((card, index) => (
              <BlockedCardRow key={index} card={card} onOpen={onOpen} />
            ))}
          </Box>
        </SidesheetCard>
      )}
      {page.collection != null && (
        <ItemCollectionCard
          heading={copy.open}
          info={copy.openInfo}
          target={page.collection}
          onOpen={onOpen}
        />
      )}
      {page.tables.length > 0 && (
        <SidesheetCard
          title={
            <CardHeading
              heading={copy.data}
              info={copy.dataInfo}
              infoLabel={t`About View data`}
            />
          }
        >
          <DataRows targets={page.tables} onOpen={onOpen} />
        </SidesheetCard>
      )}
      {page.explore.length > 0 && (
        <SidesheetCard
          title={
            <CardHeading
              heading={copy.explore}
              info={copy.exploreInfo}
              infoLabel={t`About Create queries`}
            />
          }
        >
          <ExploreRow
            targets={page.explore}
            onOpen={() => onOpenExplore(page.explore)}
          />
        </SidesheetCard>
      )}
      {hasMorePermissions && (
        <SidesheetCard>
          <Disclosure rowKey="all-permissions" label={copy.allPermissions}>
            <Box>
              {page.permissions.map((target, index) => (
                <PermissionRow
                  key={index}
                  target={target}
                  onOpen={() =>
                    target.column === "create_queries"
                      ? onOpenExplore(page.explore)
                      : onOpen(target)
                  }
                />
              ))}
            </Box>
          </Disclosure>
        </SidesheetCard>
      )}
    </>
  );
}

/** A dashboard card that can't load: its name, the blocked tables that stop it, and a status that opens the first. */
function BlockedCardRow({
  card,
  onOpen,
}: {
  card: BlockedCard;
  onOpen: (target: WhyTarget) => void;
}) {
  const [table] = card.tables;
  const tableNames = card.tables.map((target) => target.title).join(", ");
  return (
    <Row
      name={<RowName name={card.name} />}
      detail={
        table != null
          ? ngettext(
              msgid`${tableNames} table blocked`,
              `${tableNames} tables blocked`,
              card.tables.length,
            )
          : undefined
      }
      status={
        table != null ? (
          <StatusButton
            option={getPreviewOption(table.column, table.cell.value)}
            label={t`Can't load`}
            onClick={() => onOpen(table)}
          />
        ) : (
          <Text>{t`Can't load`}</Text>
        )
      }
    />
  );
}

/**
 * "Opening this dashboard": the item's collection decides, since dashboards and cards have no permissions of their
 * own (`:perms/use-parent-collection-perms` in `dashboard.clj` and `card.clj`).
 */
function ItemCollectionCard({
  heading,
  info,
  target,
  onOpen,
}: {
  heading: string;
  info: string;
  target: WhyTarget;
  onOpen: (target: WhyTarget) => void;
}) {
  return (
    <SidesheetCard
      title={
        <CardHeading
          heading={heading}
          info={info}
          infoLabel={t`About collection permissions`}
        />
      }
    >
      <AccessRow
        target={target}
        label={
          <Flex align="center" gap="sm" miw={0}>
            <Text c="text-secondary" style={{ flexShrink: 0 }}>
              {t`Collection`}
            </Text>
            <Tooltip label={target.title}>
              <Text truncate="end" miw={0}>
                {target.title}
              </Text>
            </Tooltip>
          </Flex>
        }
        onOpen={() => onOpen(target)}
      />
    </SidesheetCard>
  );
}

/** A card's title, with an ⓘ that says what decides its answer, on hover or keyboard focus. */
function CardHeading({
  heading,
  info,
  infoLabel,
}: {
  heading: string;
  info: string;
  infoLabel: string;
}) {
  return (
    <Flex component="span" align="center" gap="xs">
      {heading}
      <InfoButton info={info} label={infoLabel} />
    </Flex>
  );
}

function InfoButton({ info, label }: { info: string; label: string }) {
  return (
    <Tooltip label={info} multiline maw="20rem">
      <UnstyledButton aria-label={label} c="text-secondary" display="flex">
        <Icon name="info" />
      </UnstyledButton>
    </Tooltip>
  );
}

/**
 * One row per table. A table under row security starts open on its attributes; a blocked table is a line of its own;
 * two or more tables with full access fold into one closed row, a single one is a line of its own. Each status opens the
 * table's View data detail.
 */
function DataRows({
  targets,
  onOpen,
}: {
  targets: WhyTarget[];
  onOpen: (target: WhyTarget) => void;
}) {
  const fullAccess = targets.filter(isFullAccess);
  const tableCount = fullAccess.length;
  const isFolded = tableCount > 1;
  return (
    <Box>
      {targets
        .filter((target) => !isFolded || !isFullAccess(target))
        .map((target, index) =>
          target.security != null ? (
            <ToggleRow
              key={index}
              rowKey={`filtered-table-${index}`}
              label={<TargetName target={target} />}
              initiallyOpen
              status={
                <StatusLink target={target} onClick={() => onOpen(target)} />
              }
            >
              <Stack gap="xs">
                <Text component="div" c="text-secondary">
                  <SecurityRows security={target.security} />
                </Text>
                <Text size="sm" c="text-secondary">
                  {t`Rules set by ${target.security.group_name}`}
                </Text>
              </Stack>
            </ToggleRow>
          ) : (
            <AccessRow
              key={index}
              target={target}
              value={getDataStatusLabel(target)}
              onOpen={() => onOpen(target)}
            />
          ),
        )}
      {isFolded && (
        <ToggleRow
          rowKey="full-access-tables"
          label={
            <Text truncate="end">
              {ngettext(
                msgid`${tableCount} table`,
                `${tableCount} tables`,
                tableCount,
              )}
            </Text>
          }
          initiallyOpen={false}
          status={<Text c="text-secondary">{t`Full access`}</Text>}
        >
          <Box>
            {fullAccess.map((target, index) => (
              <AccessRow
                key={index}
                target={target}
                value={getDataStatusLabel(target)}
                onOpen={() => onOpen(target)}
              />
            ))}
          </Box>
        </ToggleRow>
      )}
    </Box>
  );
}

function isFullAccess(target: WhyTarget) {
  return target.cell.value === "unrestricted" && target.security == null;
}

/** A table's View data in the words of "Data in this dashboard": "Rows filtered", "Blocked", "Full access". */
function getDataStatusLabel(target: WhyTarget) {
  switch (target.cell.value) {
    case "sandboxed":
      return t`Rows filtered`;
    case "unrestricted":
      return t`Full access`;
    default:
      return getWhyValueLabel(target.column, target.cell.value);
  }
}

/** A row that opens and closes in place; its status is a separate button, so opening the detail doesn't toggle it. */
function ToggleRow({
  rowKey,
  label,
  initiallyOpen,
  status,
  children,
}: {
  rowKey: string;
  label: ReactNode;
  initiallyOpen: boolean;
  status: ReactNode;
  children: ReactNode;
}) {
  const [isOpen, toggle] = useOpenRow(rowKey, initiallyOpen);
  return (
    <div>
      <div className={S.toggleRow}>
        <UnstyledButton
          className={S.toggle}
          aria-expanded={isOpen}
          onClick={toggle}
        >
          <Flex align="center" gap="xs" miw={0}>
            <Icon
              name={isOpen ? "chevrondown" : "chevronright"}
              c="text-secondary"
              style={{ flexShrink: 0 }}
            />
            {label}
          </Flex>
        </UnstyledButton>
        {status}
      </div>
      <Collapse in={isOpen}>
        <Box pl="lg" pb="sm">
          {children}
        </Box>
      </Collapse>
    </div>
  );
}

function StatusLink({
  target,
  onClick,
}: {
  target: WhyTarget;
  onClick: () => void;
}) {
  return (
    <StatusButton
      option={getPreviewOption(target.column, target.cell.value)}
      label={getDataStatusLabel(target)}
      onClick={onClick}
    />
  );
}

/** "Exploring this dashboard": the tables, then their one Create queries value, or "Varies by table". */
function ExploreRow({
  targets,
  onOpen,
}: {
  targets: WhyTarget[];
  onOpen: () => void;
}) {
  const tableNames = targets.map((target) => target.title).join(", ");
  const [first] = targets;
  const isSame = targets.every(
    (target) =>
      target.cell.value === first.cell.value &&
      target.cell.group_id === first.cell.group_id,
  );
  const group = getSourceGroupName(first.cell);
  return (
    <Row
      name={<RowName name={tableNames} />}
      detail={isSame && group != null ? t`from ${group}` : undefined}
      status={
        isSame ? (
          <StatusButton
            option={getPreviewOption(first.column, first.cell.value)}
            label={getWhyValueLabel(first.column, first.cell.value)}
            onClick={onOpen}
          />
        ) : (
          <StatusButton label={t`Varies by table`} onClick={onOpen} />
        )
      }
    />
  );
}

function getItemSectionsCopy(itemType: ItemType, permissionCount: number) {
  switch (itemType) {
    case "dashboard":
      return {
        open: t`Opening this dashboard`,
        openInfo: t`Dashboards don't have their own permissions. Anyone who can see the dashboard's collection can open the dashboard.`,
        data: t`Data in this dashboard`,
        dataInfo: t`View data on each table decides whether the dashboard's results load. Row and column security shows only the rows that match the person's user attributes.`,
        explore: t`Exploring this dashboard`,
        exploreInfo: t`Create queries on each table decides whether the person can explore the dashboard's results or start a new question from those results. Editing the dashboard also needs Curate on the dashboard's collection.`,
        allPermissions: t`All permissions on this dashboard (${permissionCount})`,
      };
    case "question":
      return {
        open: t`Opening this question`,
        openInfo: t`Questions don't have their own permissions. Anyone who can see the question's collection can open the question.`,
        data: t`Data in this question`,
        dataInfo: t`View data on each table decides whether the question's results load. Row and column security shows only the rows that match the person's user attributes.`,
        explore: t`Exploring this question`,
        exploreInfo: t`Create queries on each table decides whether the person can explore the question's results or start a new question from those results. Editing the question also needs Curate on the question's collection.`,
        allPermissions: t`All permissions on this question (${permissionCount})`,
      };
    case "model":
      return {
        open: t`Opening this model`,
        openInfo: t`Models don't have their own permissions. Anyone who can see the model's collection can open the model.`,
        data: t`Data in this model`,
        dataInfo: t`View data on each table decides whether the model's results load. Row and column security shows only the rows that match the person's user attributes.`,
        explore: t`Exploring this model`,
        exploreInfo: t`Create queries on each table decides whether the person can explore the model's results or start a new question from those results. Editing the model also needs Curate on the model's collection.`,
        allPermissions: t`All permissions on this model (${permissionCount})`,
      };
    case "metric":
      return {
        open: t`Opening this metric`,
        openInfo: t`Metrics don't have their own permissions. Anyone who can see the metric's collection can open the metric.`,
        data: t`Data in this metric`,
        dataInfo: t`View data on each table decides whether the metric's results load. Row and column security shows only the rows that match the person's user attributes.`,
        explore: t`Exploring this metric`,
        exploreInfo: t`Create queries on each table decides whether the person can explore the metric's results or start a new question from those results. Editing the metric also needs Curate on the metric's collection.`,
        allPermissions: t`All permissions on this metric (${permissionCount})`,
      };
  }
}

/** A collection's answer in one line: whether it opens and from which group, its ⓘ, and its status to open the why. */
function CollectionVerdict({
  page,
  onOpen,
}: {
  page: CollectionWhyPage;
  onOpen: (target: WhyTarget) => void;
}) {
  const { target } = page;
  return (
    <Verdict
      verdict={page.verdict}
      info={
        target != null && (
          <InfoButton
            info={t`People get the most permissive collection access across all of their groups. Dashboards and questions in this collection get the same access. Open a dashboard or question to see which tables it uses.`}
            label={t`About collection permissions`}
          />
        )
      }
      status={
        target != null && (
          <StatusLink target={target} onClick={() => onOpen(target)} />
        )
      }
    />
  );
}

/** The collections the page lists, each with its access. */
function CollectionList({
  targets,
  onOpen,
}: {
  targets: WhyTarget[];
  onOpen: (target: WhyTarget) => void;
}) {
  if (targets.length === 0) {
    return null;
  }
  return (
    <SidesheetCard title={t`Collections`}>
      <AccessRows targets={targets} onOpen={onOpen} />
    </SidesheetCard>
  );
}

/** What the person can access first and unfolded, then what's filtered, then what they can't access, folded. */
function SummaryCard({
  summary,
  onOpen,
}: {
  summary: SummaryWhyPage;
  onOpen: (target: WhyTarget) => void;
}) {
  const { collections, tables, blocked } = summary;
  return (
    <SidesheetCard>
      <Verdict verdict={summary.verdict} hasIcon={false} />
      {(collections.length > 0 || tables.length > 0) && (
        <SidesheetCardSection title={t`Has access to`}>
          <Stack gap="xs">
            {collections.length > 0 && (
              <Disclosure
                rowKey="summary-collections"
                label={t`Collections (${collections.length})`}
                initiallyOpen
              >
                <AccessRows targets={collections} onOpen={onOpen} />
              </Disclosure>
            )}
            {tables.length > 0 && (
              <Disclosure
                rowKey="summary-tables"
                label={t`Tables (${tables.length})`}
                initiallyOpen
              >
                <AccessRows targets={tables} onOpen={onOpen} />
              </Disclosure>
            )}
          </Stack>
        </SidesheetCardSection>
      )}
      <FilteredSection targets={summary.filtered} onOpen={onOpen} />
      {blocked.length > 0 && (
        <SidesheetCardSection>
          <Disclosure
            rowKey="summary-blocked"
            label={t`Can't access (${blocked.length})`}
          >
            <AccessRows targets={blocked} onOpen={onOpen} />
          </Disclosure>
        </SidesheetCardSection>
      )}
    </SidesheetCard>
  );
}

const VERDICT_ICONS: Record<
  WhyVerdict["kind"],
  Pick<PermissionOption, "icon" | "iconColor">
> = {
  allowed: { icon: "check", iconColor: "feedback-positive" },
  filtered: { icon: "permissions_limited", iconColor: "core-brand" },
  partial: { icon: "warning", iconColor: "feedback-warning" },
  blocked: { icon: "close", iconColor: "feedback-negative" },
  unknown: { icon: "info", iconColor: "text-secondary" },
};

/**
 * `hasIcon={false}` for the summary: what someone can access isn't a warning, even when something is blocked. A
 * collection's verdict adds its ⓘ after the sentence and its status at the end.
 */
function Verdict({
  verdict,
  hasIcon = true,
  info,
  status,
}: {
  verdict: WhyVerdict;
  hasIcon?: boolean;
  info?: ReactNode;
  status?: ReactNode;
}) {
  const icon = VERDICT_ICONS[verdict.kind];
  return (
    <Flex align="flex-start" gap="sm" wrap="nowrap" data-testid="why-verdict">
      {hasIcon && (
        <Icon
          name={icon.icon}
          c={icon.iconColor}
          mt="xxs"
          style={{ flexShrink: 0 }}
        />
      )}
      <Box flex={1} miw={0}>
        <Flex align="center" gap="xs">
          <Text fw="bold">{verdict.text}</Text>
          {info}
        </Flex>
        {verdict.group != null && (
          <Text c="text-secondary">{t`from ${verdict.group}`}</Text>
        )}
        {verdict.reason != null && (
          <Text c="text-secondary">{verdict.reason}</Text>
        )}
      </Box>
      {status}
    </Flex>
  );
}

/** A verdict that the item doesn't open, in the design system's error alert, with why not when it's known. */
function VerdictAlert({ verdict }: { verdict: WhyVerdict }) {
  return (
    <Alert color="error" icon={<Icon name="close" />} data-testid="why-verdict">
      <Text fw="bold" c="inherit">
        {verdict.text}
      </Text>
      {verdict.reason != null && <Text c="inherit">{verdict.reason}</Text>}
    </Alert>
  );
}

/** One row per table under row security: an attribute per line, then the group that set the rules. */
function FilteredSection({
  targets,
  onOpen,
}: {
  targets: WhyTarget[];
  onOpen: (target: WhyTarget) => void;
}) {
  if (targets.length === 0) {
    return null;
  }
  return (
    <SidesheetCardSection title={t`Filtered rows`}>
      <Box>
        {targets.map((target, index) => (
          <UnstyledButton
            key={index}
            className={S.row}
            onClick={() => onOpen(target)}
          >
            <Flex align="center" gap="sm" justify="space-between">
              <TargetName target={target} />
              <Icon name="chevronright" c="text-secondary" />
            </Flex>
            {target.security != null && (
              <Stack gap="xs" mt="xs">
                <Text component="div" c="text-secondary">
                  <SecurityRows security={target.security} />
                </Text>
                <Text size="sm" c="text-secondary">
                  {t`Rules set by ${target.security.group_name}`}
                </Text>
              </Stack>
            )}
          </UnstyledButton>
        ))}
      </Box>
    </SidesheetCardSection>
  );
}

/** A collection or table, and the value it gets, "Curate · from Sales"; blocking values name no group. */
function AccessRows({
  targets,
  onOpen,
}: {
  targets: WhyTarget[];
  onOpen: (target: WhyTarget) => void;
}) {
  return (
    <Box>
      {targets.map((target, index) => (
        <AccessRow key={index} target={target} onOpen={() => onOpen(target)} />
      ))}
    </Box>
  );
}

function AccessRow({
  target,
  label,
  value,
  onOpen,
}: {
  target: WhyTarget;
  /** In place of the target's name: an item's collection reads "Collection Sales reports". */
  label?: ReactNode;
  /** In place of "Curate · from Sales": a table's data reads "Full access". */
  value?: string;
  onOpen: () => void;
}) {
  const option = getPreviewOption(target.column, target.cell.value);
  const group = getSourceGroupName(target.cell);
  const isBlocking = option.iconColor === "feedback-negative";

  return (
    <Row
      name={label ?? <TargetName target={target} />}
      detail={
        value == null && group != null && !isBlocking
          ? t`from ${group}`
          : undefined
      }
      status={
        <StatusButton
          option={option}
          label={
            value ??
            (target.cell.value === "sandboxed"
              ? getDataStatusLabel(target)
              : getWhyValueLabel(target.column, target.cell.value))
          }
          onClick={onOpen}
        />
      }
    />
  );
}

/** A per-permission row of the folded list: the object, which permission, and its value. */
function PermissionRow({
  target,
  onOpen,
}: {
  target: WhyTarget;
  onOpen: () => void;
}) {
  return (
    <Row
      name={<TargetName target={target} />}
      detail={getPreviewColumnName(target.column)}
      status={
        <StatusButton
          option={getPreviewOption(target.column, target.cell.value)}
          label={
            target.cell.value === "sandboxed"
              ? getDataStatusLabel(target)
              : getWhyValueLabel(target.column, target.cell.value)
          }
          onClick={onOpen}
        />
      }
    />
  );
}

/**
 * A row: the name, which truncates, a dimmed line under it, and the status, the row's only button. The row is a group
 * named by its two lines, so a screen reader says which row a status belongs to.
 */
function Row({
  name,
  detail,
  status,
}: {
  name: ReactNode;
  detail?: string;
  status: ReactNode;
}) {
  const nameId = useUniqueId();
  const detailId = useUniqueId();
  return (
    <div
      className={S.line}
      role="group"
      aria-labelledby={detail != null ? `${nameId} ${detailId}` : nameId}
    >
      <Box flex={1} miw={0}>
        <Box id={nameId} miw={0}>
          {name}
        </Box>
        {detail != null && (
          <Text id={detailId} size="sm" c="text-secondary" truncate="end">
            {detail}
          </Text>
        )}
      </Box>
      {status}
    </div>
  );
}

function RowName({ name }: { name: string }) {
  return (
    <Tooltip label={name}>
      <Text truncate="end">{name}</Text>
    </Tooltip>
  );
}

/** The status that opens the why: the value's icon when it has one, its label, and a chevron. */
function StatusButton({
  option,
  label,
  onClick,
}: {
  option?: Pick<PermissionOption, "icon" | "iconColor">;
  label: string;
  onClick: () => void;
}) {
  return (
    <UnstyledButton className={S.status} onClick={onClick}>
      <Flex align="center" gap="xs">
        {option != null && <Icon name={option.icon} c={option.iconColor} />}
        <Text>{label}</Text>
        <Icon name="chevronright" c="text-secondary" />
      </Flex>
    </UnstyledButton>
  );
}

function Disclosure({
  rowKey,
  label,
  initiallyOpen = false,
  children,
}: {
  rowKey: string;
  label: string;
  initiallyOpen?: boolean;
  children: ReactNode;
}) {
  const [isExpanded, toggle] = useOpenRow(rowKey, initiallyOpen);
  return (
    <div>
      <UnstyledButton aria-expanded={isExpanded} onClick={toggle}>
        <Flex align="center" gap="xs">
          <Icon
            name={isExpanded ? "chevrondown" : "chevronright"}
            c="text-secondary"
          />
          <Text c="text-secondary">{label}</Text>
        </Flex>
      </UnstyledButton>
      <Collapse in={isExpanded}>{children}</Collapse>
    </div>
  );
}

function SummaryLink({
  whoName,
  onClick,
}: {
  whoName: string;
  onClick: () => void;
}) {
  return (
    <UnstyledButton onClick={onClick}>
      <Flex align="center" gap="xs">
        <Icon name="arrow_right" c="core-brand" />
        <Text c="core-brand">{t`See everything ${whoName} can access`}</Text>
      </Flex>
    </UnstyledButton>
  );
}
