/* eslint-disable boundaries/element-types -- throwaway prototype: reuses the Dimensions tab's and the Explorer's pieces. */
import cx from "classnames";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { MetricDimensionSelect } from "metabase/metrics-viewer/components/DimensionPickerSidebar/components/MetricDimensionSelect";
import { useMetricsViewerContext } from "metabase/metrics-viewer/context";
import type { DimensionBreakoutInfo } from "metabase/metrics-viewer/types/viewer-state";
import {
  type ViewerDimensionDescriptor,
  getDimensionsByType,
  getScalarDimensionBreakoutLabel,
} from "metabase/metrics-viewer/utils/dimension-breakouts";
import RealS from "metabase/metrics/components/MetricDimensions/MetricDimensions.module.css";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  HoverCard,
  Icon,
  Input,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";
import type { MetricDefinition } from "metabase-lib/metric";
import type { IconName } from "metabase-types/api";

import S from "../dimensions/ImprovedDimensions.module.css";

import PanelS from "./DimensionsSidePanel.module.css";
import type { ColumnSpec, Kind } from "./catalog";
import {
  type Dimension,
  type DimensionMapping,
  type MetricDimensions,
  type Pill,
  mapDimension,
  pillDimensionFor,
  unmapDimension,
} from "./dimensions";

/** A dimension of the metric: a name, and one column of each pill. */
type PanelDimension = {
  id: string;
  /** What the columns are called, to match the chart's breakouts. */
  label: string;
  name: string;
  description: string;
  kind: Kind | null;
  /** By pill: the pill's own dimension it reads. */
  picks: Record<string, string | undefined>;
};

/** What the author changed beyond the default mapping. */
export type ColumnMapping = {
  edits: Record<string, Partial<PanelDimension>>;
  /** Dimensions the author created. */
  custom: PanelDimension[];
  defaultId?: string;
};

export const EMPTY_COLUMN_MAPPING: ColumnMapping = { edits: {}, custom: [] };

type View =
  | { type: "list" }
  | { type: "edit"; id: string }
  | { type: "new"; draft: PanelDimension };

const KIND_ICONS: Record<Kind, IconName> = {
  string: "string",
  number: "int",
  boolean: "io",
  date: "calendar",
};

const PILL_COLORS = [
  "var(--mb-color-accent0)",
  "var(--mb-color-accent1)",
  "var(--mb-color-accent2)",
  "var(--mb-color-accent3)",
];

/** "Orders → User → Source" */
const columnLabel = (dimension: Dimension) => {
  const [column] = dimension.columns;
  if (!column) {
    return dimension.label;
  }
  return [column.table, column.via, column.column]
    .filter((part) => part != null)
    .join(" → ");
};

const fromDimension = (
  pills: Pill[],
  dimension: Dimension,
): PanelDimension => ({
  id: dimension.id,
  label: dimension.label,
  name: dimension.label,
  description: "",
  kind: dimension.kind,
  picks: Object.fromEntries(
    pills.map((pill) => [pill.id, pillDimensionFor(pill, dimension)?.id]),
  ),
});

const ownDimension = (pill: Pill, id: string | undefined) =>
  pill.dimensions.find((candidate) => candidate.id === id);

const tablesOf = (pills: Pill[], dimension: PanelDimension) => [
  ...new Set(
    pills.flatMap(
      (pill) =>
        ownDimension(pill, dimension.picks[pill.id])?.columns.map(
          (column) => column.table,
        ) ?? [],
    ),
  ),
];

const shared = (dimension: Dimension, key: "field" | "semantic") => {
  const values = new Set(dimension.columns.map((column) => column[key]));
  const [value] = values;
  return values.size === 1 ? value : undefined;
};

/** The pill's column most like `picked`: the same field, name, or meaning. */
function closestColumn(pill: Pill, picked: Dimension) {
  const sameKind = pill.dimensions.filter((d) => d.kind === picked.kind);
  const field = shared(picked, "field");
  const semantic = shared(picked, "semantic");
  return (
    sameKind.find((d) => field != null && shared(d, "field") === field) ??
    sameKind.find((d) => d.label === picked.label) ??
    sameKind.find((d) => semantic != null && shared(d, "semantic") === semantic)
  );
}

/** The Explorer's dimension of a measure's definition that reads this column. */
function explorerDimensionFor(
  definition: MetricDefinition,
  column: ColumnSpec,
): ViewerDimensionDescriptor | undefined {
  const name = column.column.toLowerCase();
  const via = column.via?.toLowerCase();
  const candidates = [...getDimensionsByType(definition).values()].filter(
    ({ displayName }) => {
      const shown = displayName.toLowerCase();
      return (
        shown === name ||
        shown.endsWith(`→ ${name}`) ||
        shown === column.label.toLowerCase()
      );
    },
  );
  const isSameTable = ({ group, displayName }: ViewerDimensionDescriptor) =>
    via
      ? (group?.displayName.toLowerCase().includes(via) ?? false) ||
        displayName.toLowerCase().includes(via)
      : group?.type !== "connection";
  return candidates.find(isSameTable) ?? candidates[0];
}

const isComplete = (pills: Pill[], dimension: PanelDimension) =>
  dimension.name.trim() !== "" &&
  pills.every((pill) => dimension.picks[pill.id] != null);

/**
 * Prototype: the improved Dimensions tab, next to the chart. A dimension of a
 * metric over several tables reads one column per measure, picked with the
 * Explorer's per-term selects. Opening a breakout under the chart opens its
 * dimension here instead of the Explorer's sidebar.
 */
export function DimensionsSidePanel({
  pills,
  dimensions,
  mapping,
  columns,
  onChangeMapping,
  onChangeColumns,
}: {
  pills: Pill[];
  dimensions: MetricDimensions;
  mapping: DimensionMapping;
  columns: ColumnMapping;
  onChangeMapping: (mapping: DimensionMapping) => void;
  onChangeColumns: (columns: ColumnMapping) => void;
}) {
  const [view, setView] = useState<View>({ type: "list" });
  const [search, setSearch] = useState("");
  const {
    isSidebarOpen,
    closeSidebar,
    activeDimensionBreakout,
    formulaEntities,
    selectDimensionBreakout,
    definitions,
    metricSlots,
  } = useMetricsViewerContext();

  const inMetric: PanelDimension[] = [
    ...dimensions.mapped.map((dimension) => {
      const base = fromDimension(pills, dimension);
      const edit = columns.edits[dimension.id];
      return {
        ...base,
        ...edit,
        picks: { ...base.picks, ...edit?.picks },
      };
    }),
    ...columns.custom,
  ];
  const notInMetric = [
    ...dimensions.suggested.map((dimension) => ({
      dimension,
      isComplete: true,
    })),
    ...dimensions.unshared
      .filter(
        ({ dimension }) =>
          !columns.custom.some((custom) => custom.label === dimension.label),
      )
      .map(({ dimension }) => ({ dimension, isComplete: false })),
  ];
  const defaultDimension =
    inMetric.find((dimension) => dimension.id === columns.defaultId) ??
    inMetric.find((dimension) => dimension.kind === "date") ??
    inMetric[0];

  // The chart and this panel show the same dimension: the one the chart is
  // broken out by is highlighted here, and the breakout is set here.
  /** The Explorer's breakout for it: each measure's picked column, by its own dimension id. */
  const breakoutInfoFor = (
    dimension: PanelDimension,
  ): DimensionBreakoutInfo | null => {
    const found = metricSlots.flatMap((slot) => {
      const pill = pills.find((candidate) => candidate.id === slot.sourceId);
      const column =
        pill && ownDimension(pill, dimension.picks[pill.id])?.columns[0];
      const definition = definitions[slot.sourceId]?.definition;
      const match =
        column && definition ? explorerDimensionFor(definition, column) : null;
      return match ? [{ slotIndex: slot.slotIndex, match }] : [];
    });
    const [first] = found;
    return first
      ? {
          type: first.match.dimensionType,
          label: dimension.name,
          dimensionMapping: Object.fromEntries(
            found.map(({ slotIndex, match }) => [slotIndex, match.id]),
          ),
        }
      : null;
  };
  const isInChart = (dimension: PanelDimension) => {
    const info = breakoutInfoFor(dimension);
    const mapping = activeDimensionBreakout?.dimensionMapping;
    return (
      info != null &&
      mapping != null &&
      activeDimensionBreakout?.type !== "scalar" &&
      Object.entries(info.dimensionMapping).every(
        ([slotIndex, id]) => mapping[Number(slotIndex)] === id,
      )
    );
  };
  const activeDimension = inMetric.find(isInChart);
  const activeCandidate = notInMetric.find(({ dimension }) =>
    isInChart(fromDimension(pills, dimension)),
  )?.dimension;
  const showInChart = (dimension: PanelDimension): boolean => {
    const info = breakoutInfoFor(dimension);
    if (info) {
      selectDimensionBreakout(info, { updateExisting: true });
    } else {
      console.warn("[dimension panel] no Explorer column for", dimension, {
        metricSlots,
        columns: metricSlots.map((slot) => [
          slot.sourceId,
          (() => {
            const definition = definitions[slot.sourceId]?.definition;
            return definition
              ? [...getDimensionsByType(definition).values()].map(
                  ({ displayName, group }) =>
                    `${group?.displayName ?? ""} / ${displayName}`,
                )
              : "not loaded";
          })(),
        ]),
      });
    }
    return info != null;
  };
  const matches = ({ name }: { name: string }) =>
    name.toLowerCase().includes(search.trim().toLowerCase());
  const visibleNotInMetric = notInMetric.filter(({ dimension }) =>
    matches({ name: dimension.label }),
  );

  // The chart starts on the default dimension. The Explorer picks its own
  // breakout once its definitions load, so keep at it until ours sticks.
  const appliedDefaultId = useRef<string | null>(null);
  const loadedCount = Object.values(definitions).filter(
    (entry) => entry.definition != null,
  ).length;
  useEffect(() => {
    if (!defaultDimension || appliedDefaultId.current === defaultDimension.id) {
      return;
    }
    if (activeDimension?.id === defaultDimension.id) {
      appliedDefaultId.current = defaultDimension.id;
      return;
    }
    // After the Explorer's own effects, which pick Time in the same commit.
    const timeout = setTimeout(() => showInChart(defaultDimension));
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run as the Explorer loads
  }, [
    defaultDimension?.id,
    loadedCount,
    activeDimensionBreakout?.id,
    formulaEntities,
  ]);

  /** Breaks the chart out by it, or back to the plain number if it already is. */
  const toggleBreakout = (dimension: PanelDimension, isActive: boolean) => {
    appliedDefaultId.current = defaultDimension?.id ?? null;
    if (isActive) {
      selectDimensionBreakout({
        type: "scalar",
        label: getScalarDimensionBreakoutLabel(),
        dimensionMapping: {},
      });
    } else {
      showInChart(dimension);
    }
  };

  // The control under the chart opens its dimension here, not a sidebar.
  useEffect(() => {
    if (!isSidebarOpen) {
      return;
    }
    closeSidebar();
    if (activeDimension) {
      setView({ type: "edit", id: activeDimension.id });
    } else if (activeCandidate) {
      setView({ type: "new", draft: fromDimension(pills, activeCandidate) });
    } else {
      setView({ type: "list" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the Explorer asks for its sidebar
  }, [isSidebarOpen]);

  const editing =
    view.type === "edit"
      ? inMetric.find((dimension) => dimension.id === view.id)
      : undefined;

  const updateExisting = (id: string, change: Partial<PanelDimension>) => {
    const custom = columns.custom.find((dimension) => dimension.id === id);
    onChangeColumns(
      custom
        ? {
            ...columns,
            custom: columns.custom.map((dimension) =>
              dimension.id === id ? { ...dimension, ...change } : dimension,
            ),
          }
        : {
            ...columns,
            edits: {
              ...columns.edits,
              [id]: { ...columns.edits[id], ...change },
            },
          },
    );
  };

  const remove = (id: string) => {
    const mapped = dimensions.mapped.find((dimension) => dimension.id === id);
    if (mapped) {
      onChangeMapping(unmapDimension(mapping, mapped));
    } else {
      onChangeColumns({
        ...columns,
        custom: columns.custom.filter((dimension) => dimension.id !== id),
      });
    }
  };

  const add = (dimension: Dimension, isComplete: boolean) => {
    if (isComplete) {
      onChangeMapping(mapDimension(mapping, dimension));
    } else {
      setView({ type: "new", draft: fromDimension(pills, dimension) });
    }
  };

  if (pills.length === 0) {
    return (
      <Text p="lg" c="text-secondary">
        Add a measure to see its dimensions.
      </Text>
    );
  }

  return (
    <ScrollArea h="100%">
      <Stack gap="lg" p="lg">
        {view.type === "new" ? (
          <DimensionForm
            title={view.draft.name || "New dimension"}
            pills={pills}
            dimension={view.draft}
            onBack={() => setView({ type: "list" })}
            onChange={(change) =>
              setView({ type: "new", draft: { ...view.draft, ...change } })
            }
            footer={
              <Group justify="flex-end" gap="sm">
                <Button onClick={() => setView({ type: "list" })}>
                  Cancel
                </Button>
                <Button
                  variant="filled"
                  disabled={!isComplete(pills, view.draft)}
                  onClick={() => {
                    onChangeColumns({
                      ...columns,
                      custom: [...columns.custom, view.draft],
                    });
                    setView({ type: "list" });
                  }}
                >
                  Add to metric
                </Button>
              </Group>
            }
          />
        ) : editing ? (
          <DimensionForm
            title={editing.name || "Untitled dimension"}
            pills={pills}
            dimension={editing}
            onBack={() => setView({ type: "list" })}
            onChange={(change) => updateExisting(editing.id, change)}
            headerAction={
              editing.id === defaultDimension?.id ? (
                <Badge variant="light" flex="none">
                  Default
                </Badge>
              ) : (
                <Button
                  size="compact-sm"
                  flex="none"
                  onClick={() =>
                    onChangeColumns({ ...columns, defaultId: editing.id })
                  }
                >
                  Set as default
                </Button>
              )
            }
          />
        ) : (
          <>
            <TextInput
              leftSection={<Icon name="search" />}
              placeholder="Search dimensions…"
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
            />
            <Section
              title="Dimensions in this metric"
              count={inMetric.length}
              action={
                <HoverCard position="bottom-end" withArrow>
                  <HoverCard.Target>
                    <Icon name="info" size={14} c="text-secondary" />
                  </HoverCard.Target>
                  <HoverCard.Dropdown>
                    <Text maw={280} p="md">
                      {pills.length > 1
                        ? "What the whole metric can be filtered and broken out by. Each one reads a column from every measure, even across tables."
                        : "What this metric can be filtered and broken out by."}
                    </Text>
                  </HoverCard.Dropdown>
                </HoverCard>
              }
            >
              {inMetric.filter(matches).map((dimension) => (
                <Row
                  key={dimension.id}
                  kind={dimension.kind}
                  name={dimension.name}
                  tables={tablesOf(pills, dimension)}
                  isActive={dimension.id === activeDimension?.id}
                  isDefault={dimension.id === defaultDimension?.id}
                  moveLabel="Remove from metric"
                  isValid={isComplete(pills, dimension)}
                  onClick={() =>
                    isComplete(pills, dimension)
                      ? toggleBreakout(dimension, false)
                      : setView({ type: "edit", id: dimension.id })
                  }
                  onRemoveBreakout={() => toggleBreakout(dimension, true)}
                  onEdit={() => setView({ type: "edit", id: dimension.id })}
                  onMove={() => remove(dimension.id)}
                />
              ))}
            </Section>
            {visibleNotInMetric.length > 0 && (
              <Section
                title="Dimensions not in this metric"
                count={notInMetric.length}
              >
                {visibleNotInMetric.map(
                  ({ dimension, isComplete: hasEveryColumn }) => {
                    const panelDimension = fromDimension(pills, dimension);
                    return (
                      <Row
                        key={dimension.id}
                        kind={dimension.kind}
                        name={dimension.label}
                        tables={tablesOf(pills, panelDimension)}
                        isAvailable
                        moveLabel="Add to metric"
                        isValid={hasEveryColumn}
                        isActive={
                          activeDimension == null &&
                          activeCandidate?.id === dimension.id
                        }
                        onClick={() =>
                          hasEveryColumn
                            ? toggleBreakout(panelDimension, false)
                            : setView({ type: "new", draft: panelDimension })
                        }
                        onRemoveBreakout={() =>
                          toggleBreakout(panelDimension, true)
                        }
                        onEdit={() =>
                          setView({ type: "new", draft: panelDimension })
                        }
                        onMove={() => add(dimension, hasEveryColumn)}
                      />
                    );
                  },
                )}
              </Section>
            )}
            <Button
              variant="subtle"
              leftSection={<Icon name="add" />}
              style={{ alignSelf: "flex-start" }}
              onClick={() => setView({ type: "new", draft: newDraft() })}
            >
              New dimension
            </Button>
          </>
        )}
      </Stack>
    </ScrollArea>
  );
}

const newDraft = (): PanelDimension => ({
  id: `custom:${Date.now()}`,
  label: "",
  name: "",
  description: "",
  kind: null,
  picks: {},
});

function Section({
  title,
  count,
  action,
  children,
}: {
  title: string;
  count: number;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Box>
      <Group gap="xs" mb="sm">
        <Title order={5}>{title}</Title>
        <Text c="text-secondary" size="sm" flex={1}>
          {count}
        </Text>
        {action}
      </Group>
      <Stack gap="sm">{children}</Stack>
    </Box>
  );
}

function Row({
  kind,
  name,
  tables,
  isActive = false,
  isDefault = false,
  isAvailable = false,
  moveLabel,
  isValid,
  onClick,
  onRemoveBreakout,
  onEdit,
  onMove,
}: {
  kind: Kind | null;
  name: string;
  tables: string[];
  isActive?: boolean;
  isDefault?: boolean;
  isAvailable?: boolean;
  moveLabel: string;
  /** Every measure has a column, so the chart can be broken out by it. */
  isValid: boolean;
  /** Breaks the chart out by it. */
  onClick: () => void;
  onRemoveBreakout: () => void;
  onEdit: () => void;
  onMove: () => void;
}) {
  const action =
    (handler: () => void) => (event: React.MouseEvent<HTMLElement>) => {
      event.stopPropagation();
      handler();
    };
  return (
    <Group
      gap="sm"
      wrap="nowrap"
      role="button"
      tabIndex={0}
      className={cx(RealS.row, S.row, {
        [PanelS.selectedRow]: isActive,
        [PanelS.validRow]: isValid && !isActive,
        [PanelS.invalidRow]: !isValid,
        [S.availableRow]: isAvailable,
      })}
      onClick={onClick}
    >
      {/* The name keeps its width; the tables take the rest and truncate. */}
      <Group
        gap="sm"
        wrap="nowrap"
        miw={0}
        style={{ flex: "0 0 auto", maxWidth: "60%" }}
      >
        <Icon name={kind ? KIND_ICONS[kind] : "string"} c="text-secondary" />
        <Text
          miw={0}
          truncate="end"
          c={isAvailable ? "text-secondary" : undefined}
        >
          {name}
        </Text>
        {isDefault && (
          <Badge variant="light" flex="none">
            Default
          </Badge>
        )}
      </Group>
      {isActive && (
        <Tooltip label="Remove the breakout">
          <UnstyledButton
            aria-label="Remove the breakout"
            display="flex"
            flex="none"
            onClick={action(onRemoveBreakout)}
          >
            <Badge
              variant="light"
              color="brand"
              leftSection={<Icon name="arrow_split" size={12} />}
              style={{ cursor: "pointer" }}
            >
              Breakout
            </Badge>
          </UnstyledButton>
        </Tooltip>
      )}
      <Box
        className={S.trailing}
        style={{
          flex: "1 1 auto",
          width: "auto",
          minWidth: "3.5rem",
          display: "flex",
          justifyContent: "flex-end",
        }}
      >
        <Group gap={4} wrap="nowrap" miw={0} className={S.table}>
          <Icon name="table" size={12} c="icon-disabled" flex="none" />
          <Text size="sm" c="text-secondary" truncate="end">
            {tables.join(", ")}
          </Text>
        </Group>
        <Group gap="sm" wrap="nowrap" className={cx(S.hoverAction, S.actions)}>
          <Tooltip label={moveLabel}>
            <ActionIcon
              aria-label={moveLabel}
              variant="subtle"
              c="core-brand"
              size="sm"
              onClick={action(onMove)}
            >
              <Icon name="sort_arrows" size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Edit dimension">
            <ActionIcon
              aria-label="Edit dimension"
              variant="subtle"
              c="core-brand"
              size="sm"
              onClick={action(onEdit)}
            >
              <Icon name="pencil" size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Box>
    </Group>
  );
}

function DimensionForm({
  title,
  headerAction,
  pills,
  dimension,
  onBack,
  onChange,
  footer,
}: {
  title: string;
  headerAction?: ReactNode;
  pills: Pill[];
  dimension: PanelDimension;
  onBack: () => void;
  onChange: (change: Partial<PanelDimension>) => void;
  footer?: ReactNode;
}) {
  /** The first column picked sets the kind and fills in the other measures. */
  const pick = (pill: Pill, id: string) => {
    const picked = ownDimension(pill, id);
    if (!picked) {
      return;
    }
    if (dimension.kind != null) {
      onChange({ picks: { ...dimension.picks, [pill.id]: id } });
      return;
    }
    const filled = Object.fromEntries(
      pills.map((other) => [
        other.id,
        other.id === pill.id ? id : closestColumn(other, picked)?.id,
      ]),
    );
    onChange({
      kind: picked.kind,
      name: dimension.name || picked.label,
      label: dimension.label || picked.label,
      picks: filled,
    });
  };

  return (
    <>
      <Group gap="xs" wrap="nowrap">
        <ActionIcon
          aria-label="Back to dimensions"
          variant="subtle"
          c="text-secondary"
          onClick={onBack}
        >
          <Icon name="chevronleft" />
        </ActionIcon>
        <Title order={4} miw={0} flex={1}>
          {title}
        </Title>
        {headerAction}
      </Group>
      <TextInput
        label="Display name"
        value={dimension.name}
        onChange={(event) => onChange({ name: event.currentTarget.value })}
      />
      <Textarea
        label="Description"
        placeholder="Add a description"
        value={dimension.description}
        autosize
        minRows={2}
        onChange={(event) =>
          onChange({ description: event.currentTarget.value })
        }
      />
      <Input.Wrapper label="Columns">
        <Stack gap="xxs">
          {pills.map((pill, slotIndex) => (
            <MetricDimensionSelect
              key={pill.id}
              row={{
                slotIndex,
                sourceId: `metric:${slotIndex}`,
                metricName: pill.name,
                colors: [PILL_COLORS[slotIndex % PILL_COLORS.length]],
                isExpressionToken: false,
                value: dimension.picks[pill.id] ?? null,
                options: pill.dimensions
                  .filter(
                    (candidate) =>
                      dimension.kind == null ||
                      candidate.kind === dimension.kind,
                  )
                  .map((candidate) => ({
                    value: candidate.id,
                    label: columnLabel(candidate),
                    icon: KIND_ICONS[candidate.kind],
                  })),
              }}
              onChange={(id) => pick(pill, id)}
            />
          ))}
        </Stack>
      </Input.Wrapper>
      {footer}
    </>
  );
}
