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

import { CreateQueriesContent } from "./CreateQueriesContent";
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
  /** The item the page shows now; the sheet follows it while open. */
  openedItem: OpenedItem | null;
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
 * what filters, why it opens), with every permission on it folded away; with no item open, their whole access. Each
 * row opens the per-value "why" of the permission tabs.
 */
export function WhyListSidesheet({
  isOpen,
  preview,
  whoName,
  openedItem,
  onClose,
}: WhyListSidesheetProps) {
  const list = useWhyList(isOpen ? preview : null, openedItem, whoName);
  const itemKey =
    openedItem != null ? `${openedItem.type}-${openedItem.id}` : "none";
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

  return (
    <Sidesheet
      title={
        <SheetTitle
          view={view}
          page={page}
          isLoading={list == null}
          whoName={whoName}
          onBack={handleBack}
        />
      }
      isOpen={isOpen}
      onClose={handleClose}
      withOverlay={false}
      isModal={false}
    >
      {/* the sheet's own gap, so the scroll container stays this box's parent */}
      <Stack gap="xl" ref={contentRef}>
        <OpenRowsContext.Provider
          value={{ openRows, onToggle: handleToggleRow }}
        >
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
              <Text c="text-secondary">
                {getItemSubtitle(page.itemType, whoName)}
              </Text>
              <ItemCard
                page={page}
                onOpen={handleOpenTarget}
                onOpenExplore={(targets) =>
                  openView({ kind: "explore", targets })
                }
              />
              <SummaryLink
                whoName={whoName}
                onClick={() => openView({ kind: "summary" })}
              />
            </>
          ) : page?.kind === "collection" ? (
            <>
              <Text c="text-secondary">{t`Collection · as ${whoName}`}</Text>
              <CollectionCard page={page} onOpen={handleOpenTarget} />
              <SummaryLink
                whoName={whoName}
                onClick={() => openView({ kind: "summary" })}
              />
            </>
          ) : null}
        </OpenRowsContext.Provider>
      </Stack>
    </Sidesheet>
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

function SheetTitle({
  view,
  page,
  isLoading,
  whoName,
  onBack,
}: {
  view: SheetView | null;
  page: ItemWhyPage | CollectionWhyPage | null;
  isLoading: boolean;
  whoName: string;
  onBack: () => void;
}) {
  if (view != null) {
    return (
      <Flex align="center" gap="xs">
        <Button
          size="compact-sm"
          variant="subtle"
          aria-label={t`Back`}
          leftSection={<Icon name="chevronleft" />}
          onClick={onBack}
        />
        {view.kind === "detail"
          ? `${view.target.title} · ${getPreviewColumnName(view.target.column)}`
          : view.kind === "explore"
            ? getPreviewColumnName("create_queries")
            : t`What ${whoName} can access`}
      </Flex>
    );
  }
  if (isLoading) {
    return t`Explain access`;
  }
  if (page?.name != null) {
    return t`Access to “${page.name}”`;
  }
  return page != null ? t`Access` : t`What ${whoName} can access`;
}

function getItemSubtitle(itemType: ItemType, whoName: string) {
  switch (itemType) {
    case "dashboard":
      return t`Dashboard · as ${whoName}`;
    case "model":
      return t`Model · as ${whoName}`;
    case "metric":
      return t`Metric · as ${whoName}`;
    case "question":
      return t`Question · as ${whoName}`;
  }
}

/**
 * Three answers, each under its own heading: opening the item (its collection), its data (View data on each table),
 * and exploring it (Create queries); then every permission on it, folded away.
 */
function ItemCard({
  page,
  onOpen,
  onOpenExplore,
}: {
  page: ItemWhyPage;
  onOpen: (target: WhyTarget) => void;
  onOpenExplore: (targets: WhyTarget[]) => void;
}) {
  const copy = getItemSectionsCopy(page.itemType, page.permissions.length);
  return (
    <SidesheetCard>
      {page.verdict.kind === "blocked" ? (
        <VerdictAlert verdict={page.verdict} />
      ) : (
        <Verdict verdict={page.verdict} />
      )}
      {page.collection != null && (
        <ItemCollectionSection
          heading={copy.open}
          info={copy.openInfo}
          target={page.collection}
          onOpen={onOpen}
        />
      )}
      {page.tables.length > 0 && (
        <SidesheetCardSection>
          <SectionHeading
            heading={copy.data}
            info={copy.dataInfo}
            infoLabel={t`About View data`}
          />
          <DataRows targets={page.tables} onOpen={onOpen} />
        </SidesheetCardSection>
      )}
      {page.explore.length > 0 && (
        <SidesheetCardSection>
          <SectionHeading
            heading={copy.explore}
            info={copy.exploreInfo}
            infoLabel={t`About Create queries`}
          />
          <ExploreRow
            targets={page.explore}
            onOpen={() => onOpenExplore(page.explore)}
          />
        </SidesheetCardSection>
      )}
      <Disclosure rowKey="all-permissions" label={copy.allPermissions}>
        <Stack gap={0}>
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
        </Stack>
      </Disclosure>
    </SidesheetCard>
  );
}

/**
 * "Opening this dashboard": the item's collection decides, since dashboards and cards have no permissions of their
 * own (`:perms/use-parent-collection-perms` in `dashboard.clj` and `card.clj`).
 */
function ItemCollectionSection({
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
    <SidesheetCardSection>
      <SectionHeading
        heading={heading}
        info={info}
        infoLabel={t`About collection permissions`}
      />
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
    </SidesheetCardSection>
  );
}

/** A section's heading, with an ⓘ that says what decides its answer, on hover or keyboard focus. */
function SectionHeading({
  heading,
  info,
  infoLabel,
}: {
  heading: string;
  info: string;
  infoLabel: string;
}) {
  return (
    <Flex align="center" gap="xs" mb="sm">
      <Title c="text-secondary" order={4}>
        {heading}
      </Title>
      <Tooltip label={info} multiline maw="20rem">
        <UnstyledButton
          aria-label={infoLabel}
          c="text-secondary"
          display="flex"
        >
          <Icon name="info" />
        </UnstyledButton>
      </Tooltip>
    </Flex>
  );
}

/**
 * One row per table. A table under row security starts open on its attributes; a blocked table is a line of its own;
 * tables with full access fold into one closed row. Each status opens the table's View data detail.
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
  return (
    <Stack gap={0}>
      {targets
        .filter((target) => !isFullAccess(target))
        .map((target, index) =>
          target.security != null ? (
            <ToggleRow
              key={index}
              rowKey={`filtered-table-${index}`}
              label={target.title}
              initiallyOpen
              status={
                <StatusLink target={target} onClick={() => onOpen(target)} />
              }
            >
              <Stack gap="xs">
                <Text component="div" fz="sm" c="text-secondary">
                  <SecurityRows security={target.security} />
                </Text>
                <Text fz="sm" c="text-secondary">
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
      {tableCount > 0 && (
        <ToggleRow
          rowKey="full-access-tables"
          label={ngettext(
            msgid`${tableCount} table`,
            `${tableCount} tables`,
            tableCount,
          )}
          initiallyOpen={false}
          status={<Text c="text-secondary">{t`Full access`}</Text>}
        >
          <Stack gap={0}>
            {fullAccess.map((target, index) => (
              <AccessRow
                key={index}
                target={target}
                value={getDataStatusLabel(target)}
                onOpen={() => onOpen(target)}
              />
            ))}
          </Stack>
        </ToggleRow>
      )}
    </Stack>
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
  label: string;
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
            <Text truncate="end">{label}</Text>
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
  const option = getPreviewOption(target.column, target.cell.value);
  return (
    <UnstyledButton className={S.status} onClick={onClick}>
      <Flex align="center" gap="xs">
        <Icon name={option.icon} c={option.iconColor} />
        <Text>{getDataStatusLabel(target)}</Text>
        <Icon name="chevronright" c="text-secondary" />
      </Flex>
    </UnstyledButton>
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
  const option = getPreviewOption(first.column, first.cell.value);
  const group = getSourceGroupName(first.cell);
  const value = getWhyValueLabel(first.column, first.cell.value);
  return (
    <UnstyledButton className={S.row} onClick={onOpen}>
      <Flex align="center" gap="sm" justify="space-between">
        <Tooltip label={tableNames}>
          <Text truncate="end" miw={0}>
            {tableNames}
          </Text>
        </Tooltip>
        <Flex align="center" gap="xs" style={{ flexShrink: 0 }}>
          {isSame && <Icon name={option.icon} c={option.iconColor} />}
          <Text>
            {!isSame
              ? t`Varies by table`
              : group != null
                ? t`${value} · from ${group}`
                : value}
          </Text>
          <Icon name="chevronright" c="text-secondary" />
        </Flex>
      </Flex>
    </UnstyledButton>
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

function CollectionCard({
  page,
  onOpen,
}: {
  page: CollectionWhyPage;
  onOpen: (target: WhyTarget) => void;
}) {
  return (
    <SidesheetCard>
      <Verdict verdict={page.verdict} />
      <BlockedSection targets={page.blocked} onOpen={onOpen} />
      {page.reasons.length > 0 && (
        <SidesheetCardSection>
          <SectionHeading
            heading={t`Opening this collection`}
            info={t`People get the most permissive collection access across all of their groups. Dashboards and questions in this collection get the same access. Open a dashboard or question to see which tables it uses.`}
            infoLabel={t`About collection permissions`}
          />
          <AccessRows targets={page.reasons} onOpen={onOpen} />
        </SidesheetCardSection>
      )}
    </SidesheetCard>
  );
}

function SummaryCard({
  summary,
  onOpen,
}: {
  summary: SummaryWhyPage;
  onOpen: (target: WhyTarget) => void;
}) {
  return (
    <SidesheetCard>
      <Verdict verdict={summary.verdict} hasIcon={false} />
      <BlockedSection targets={summary.blocked} onOpen={onOpen} />
      <FilteredSection targets={summary.filtered} onOpen={onOpen} />
      {(summary.collections.length > 0 || summary.tables.length > 0) && (
        <SidesheetCardSection title={t`Has access to`}>
          <Stack gap="xs">
            <Disclosure
              rowKey="summary-collections"
              label={t`Collections (${summary.collections.length})`}
            >
              <AccessRows targets={summary.collections} onOpen={onOpen} />
            </Disclosure>
            <Disclosure
              rowKey="summary-tables"
              label={t`Tables (${summary.tables.length})`}
            >
              <AccessRows targets={summary.tables} onOpen={onOpen} />
            </Disclosure>
          </Stack>
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

/** `hasIcon={false}` for the summary: what someone can access isn't a warning, even when something is blocked. */
function Verdict({
  verdict,
  hasIcon = true,
}: {
  verdict: WhyVerdict;
  hasIcon?: boolean;
}) {
  const icon = VERDICT_ICONS[verdict.kind];
  return (
    <Flex align="flex-start" gap="sm" wrap="nowrap" data-testid="why-verdict">
      {hasIcon && (
        <Icon
          name={icon.icon}
          c={icon.iconColor}
          mt={2}
          style={{ flexShrink: 0 }}
        />
      )}
      <Stack gap={0}>
        <Text fw="bold">{verdict.text}</Text>
        {verdict.group != null && (
          <Text c="text-secondary">{t`from ${verdict.group}`}</Text>
        )}
      </Stack>
    </Flex>
  );
}

/** A verdict that the item doesn't open, in the design system's error alert. */
function VerdictAlert({ verdict }: { verdict: WhyVerdict }) {
  return (
    <Alert color="error" icon={<Icon name="close" />} data-testid="why-verdict">
      <Text fw="bold" c="inherit">
        {verdict.text}
      </Text>
    </Alert>
  );
}

function BlockedSection({
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
    <SidesheetCardSection title={t`Blocked`}>
      <AccessRows targets={targets} onOpen={onOpen} />
    </SidesheetCardSection>
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
      <Stack gap={0}>
        {targets.map((target, index) => (
          <UnstyledButton
            key={index}
            className={S.row}
            onClick={() => onOpen(target)}
          >
            <Flex align="center" gap="sm" justify="space-between">
              <Text truncate="end">{target.title}</Text>
              <Icon name="chevronright" c="text-secondary" />
            </Flex>
            {target.security != null && (
              <Stack gap="xs" mt="xs">
                <Text component="div" fz="sm" c="text-secondary">
                  <SecurityRows security={target.security} />
                </Text>
                <Text fz="sm" c="text-secondary">
                  {t`Rules set by ${target.security.group_name}`}
                </Text>
              </Stack>
            )}
          </UnstyledButton>
        ))}
      </Stack>
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
    <Stack gap={0}>
      {targets.map((target, index) => (
        <AccessRow key={index} target={target} onOpen={() => onOpen(target)} />
      ))}
    </Stack>
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
  const valueLabel = getWhyValueLabel(target.column, target.cell.value);
  const group = getSourceGroupName(target.cell);
  const isBlocking = option.iconColor === "feedback-negative";

  return (
    <UnstyledButton className={S.row} onClick={onOpen}>
      <Flex align="center" gap="sm" justify="space-between">
        {label ?? (
          <Text truncate="end" miw={0}>
            {target.title}
          </Text>
        )}
        <Flex align="center" gap="xs" style={{ flexShrink: 0 }}>
          <Icon name={option.icon} c={option.iconColor} />
          <Text>
            {value ??
              (group != null && !isBlocking
                ? t`${valueLabel} · from ${group}`
                : valueLabel)}
          </Text>
          <Icon name="chevronright" c="text-secondary" />
        </Flex>
      </Flex>
    </UnstyledButton>
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
  const option = getPreviewOption(target.column, target.cell.value);

  return (
    <UnstyledButton className={S.row} onClick={onOpen}>
      <Flex align="center" gap="sm" justify="space-between">
        <Stack gap={0} miw={0}>
          <Text truncate="end">{target.title}</Text>
          <Text fz="sm" c="text-secondary">
            {getPreviewColumnName(target.column)}
          </Text>
        </Stack>
        <Flex align="center" gap="xs" style={{ flexShrink: 0 }}>
          <Icon name={option.icon} c={option.iconColor} />
          <Text>{getWhyValueLabel(target.column, target.cell.value)}</Text>
          <Icon name="chevronright" c="text-secondary" />
        </Flex>
      </Flex>
    </UnstyledButton>
  );
}

function Disclosure({
  rowKey,
  label,
  children,
}: {
  rowKey: string;
  label: string;
  children: ReactNode;
}) {
  const [isExpanded, toggle] = useOpenRow(rowKey, false);
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
