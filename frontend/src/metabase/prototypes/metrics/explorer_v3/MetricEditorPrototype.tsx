/* eslint-disable boundaries/element-types -- throwaway prototype: embeds the real Metric Explorer's parts. */
import cx from "classnames";
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useListMeasuresQuery } from "metabase/api";
import { PillTabNavigation } from "metabase/common/components/PillTabNavigation";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import {
  PaneHeader,
  PaneHeaderActions,
  PaneHeaderInput,
  PanelHeaderTitle,
} from "metabase/common/data-studio/components/PaneHeader";
import { BreakoutLegend } from "metabase/metrics-viewer/components/BreakoutLegend/BreakoutLegend";
import { DimensionPickerSidebar } from "metabase/metrics-viewer/components/DimensionPickerSidebar";
import {
  MetricsViewerEmptyState,
  MetricsViewerNoDimensionBreakoutEmptyState,
} from "metabase/metrics-viewer/components/EmptyState";
import { MetricsViewerDimensionBreakoutContent } from "metabase/metrics-viewer/components/MetricsViewerDimensionBreakoutContent";
import {
  MetricsViewerProvider,
  useMetricsViewerContext,
} from "metabase/metrics-viewer/context";
import { useViewerState } from "metabase/metrics-viewer/hooks";
import PageS from "metabase/metrics-viewer/pages/MetricsViewerPage/MetricsViewerPage.module.css";
import type {
  ExpressionSubToken,
  MetricSourceId,
  MetricsViewerFormulaEntity,
} from "metabase/metrics-viewer/types/viewer-state";
import { getDimensionBreakoutLabel } from "metabase/metrics-viewer/utils/dimension-breakouts";
import { stampMetricCounts } from "metabase/metrics-viewer/utils/expression";
import { useLocation, useNavigate } from "metabase/router";
import {
  ActionIcon,
  Box,
  Breadcrumbs,
  Card,
  Center,
  Flex,
  Group,
  Icon,
  Loader,
  SegmentedControl,
  Stack,
  Text,
} from "metabase/ui";
import type * as LibMetric from "metabase-lib/metric";
import type { Card as CardType, MathOperator } from "metabase-types/api";

import { MetricTabContent, isRealTab } from "../MetricTabContent";
import {
  MetricsList,
  useMetrics,
} from "../explorer_v2/MetricExplorerPrototype";

import { DefinitionEditor, type SegmentPlacement } from "./DefinitionEditor";
import {
  type ColumnMapping,
  DimensionsSidePanel,
  EMPTY_COLUMN_MAPPING,
} from "./DimensionsSidePanel";
import { DimensionsTab } from "./DimensionsTab";
import { EXAMPLE_PARAM_PREFIX, ExamplesBar } from "./ExamplesBar";
import S from "./Explorer.module.css";
import { MissingMeasures } from "./MissingMeasures";
import { NewSegmentModal } from "./NewSegmentModal";
import type { BarItem } from "./TokenBar";
import { MEASURE_COLUMNS, MEASURE_TABLES } from "./catalog";
import {
  EMPTY_MAPPING,
  type MetricDimensions,
  type Resolver,
  dimensionLabelOf,
  findFilterProblem,
  flattenDraft,
  metricDimensions,
  pillOf,
  pillsOf,
  tableDimensions,
} from "./dimensions";
import {
  COMPOSITE_IDS,
  COMPOSITE_PREFIX,
  EXAMPLES,
  type MetricExample,
  applyFilters,
  exampleDraft,
  measuresOf,
  suggestFilters,
} from "./examples";
import {
  type FormulaProblem,
  type FormulaToken,
  type MetricDraft,
  type Op,
  findProblem,
  isComplete,
  newKey,
} from "./formula";
import {
  SEGMENTS,
  type Segment,
  expandSegments,
  segmentItems,
  toSegments,
} from "./segments";

const TABS = ["About", "Overview", "Definition", "Dimensions", "Dependencies"];
const NEW_TABS = ["Definition", "Dimensions"];
const NEW = "new";
const EXAMPLE = EXAMPLE_PARAM_PREFIX;

const OP_TO_MATH: Record<Op, MathOperator> = {
  "+": "+",
  "−": "-",
  "×": "*",
  "÷": "/",
};

const EMPTY_DRAFT: MetricDraft = {
  name: "",
  formula: [],
  where: [],
  mapping: EMPTY_MAPPING,
};

const COMPOSITES = EXAMPLES.filter(({ id }) => COMPOSITE_IDS.includes(id));

/** Measures and metrics on this instance, as the bar's options. */
function useSourceItems() {
  const { metrics, isLoading: isLoadingMetrics } = useMetrics();
  const { data: measures = [], isLoading: isLoadingMeasures } =
    useListMeasuresQuery();

  const items = useMemo((): BarItem[] => {
    const measureItems = measures
      .filter((measure) => !measure.archived)
      .map(
        (measure): BarItem => ({
          id: `measure:${measure.id}`,
          label: measure.name,
          icon: "ruler",
          info:
            measure.description ?? measure.definition_description ?? undefined,
          section: MEASURE_TABLES[measure.name] ?? "Measures",
          sectionIcon: "table",
        }),
      )
      .toSorted((a, b) => (a.section ?? "").localeCompare(b.section ?? ""));
    const metricItems = metrics.map(
      (metric): BarItem => ({
        id: `metric:${metric.id}`,
        label: metric.name,
        icon: "metric",
        section: "Metrics",
        sectionIcon: "metric",
      }),
    );
    // Only the ones this instance has every measure for.
    const compositeItems = COMPOSITES.filter((example) =>
      measuresOf(example).every((name) =>
        measures.some((m) => m.name === name && !m.archived),
      ),
    ).map(
      (example): BarItem => ({
        id: `${COMPOSITE_PREFIX}${example.id}`,
        label: example.name,
        icon: "metric",
        info: "Math over measures, used here as one pill.",
        section: "Metrics",
        sectionIcon: "metric",
      }),
    );
    return [...measureItems, ...compositeItems, ...metricItems];
  }, [measures, metrics]);

  const nameOf = (id: string) =>
    items.find((item) => item.id === id)?.label ?? id;
  /** The example's measures this instance doesn't have, by name. */
  const missingFor = (example: MetricExample) =>
    measuresOf(example).filter(
      (name) => !measures.some((m) => m.name === name && !m.archived),
    );

  const idOf = useCallback(
    (measureName: string) =>
      `measure:${measures.find((m) => m.name === measureName)?.id}`,
    [measures],
  );

  /** What each pill is: its table's dimensions, or the pills it's math over. */
  const resolver = useMemo((): Resolver => {
    const inner = new Map(
      COMPOSITES.map((example) => [
        `${COMPOSITE_PREFIX}${example.id}`,
        exampleDraft(example, idOf),
      ]),
    );
    const tableOfMeasure = (measure?: { name: string }) =>
      measure ? MEASURE_TABLES[measure.name] : undefined;
    const tableOf = (id: string) => {
      const [type, rawId] = id.split(":");
      if (type === "measure") {
        return tableOfMeasure(measures.find((m) => String(m.id) === rawId));
      }
      const metric = metrics.find((card) => String(card.id) === rawId);
      return tableOfMeasure(
        measures.find(
          (m) =>
            metric != null &&
            m.table_id === metric.table_id &&
            m.name in MEASURE_TABLES,
        ),
      );
    };
    return {
      inner: (id) => inner.get(id) ?? null,
      leaf: (id) => {
        const item = items.find((candidate) => candidate.id === id);
        const table = tableOf(id);
        return item
          ? {
              id,
              name: item.label,
              dimensions: table ? tableDimensions(table) : [],
            }
          : null;
      },
    };
  }, [items, measures, metrics, idOf]);

  return {
    metrics,
    measures,
    items,
    nameOf,
    resolver,
    idOf,
    missingFor,
    isLoading: isLoadingMetrics || isLoadingMeasures,
  };
}

/**
 * The instance's metrics aren't measure math yet, so start each one from the
 * measure on its table that it's named after, like Number of Orders → Orders.
 */
function initialDraftFor(
  metric: CardType,
  measures: { id: number; name: string; table_id: number | string }[],
): MetricDraft {
  const onTable = measures.filter((m) => m.table_id === metric.table_id);
  const measure =
    onTable.find((m) =>
      metric.name.toLowerCase().includes(m.name.toLowerCase()),
    ) ??
    onTable[0] ??
    measures[0];
  const id = measure ? `measure:${measure.id}` : `metric:${metric.id}`;
  return {
    name: metric.name,
    formula: [{ key: newKey(), kind: "term", measureId: id, filters: [] }],
    where: [],
    mapping: EMPTY_MAPPING,
  };
}

/** Comparable form of a draft, without the tokens' keys. */
const signature = ({ name, formula, where, mapping }: MetricDraft) =>
  JSON.stringify({
    name,
    formula: formula.map(({ key: _, ...token }) => token),
    where: where.map(({ filter }) => filter),
    mapping,
  });

/**
 * Metrics 3.0: the Metric Explorer is the metric editor. A metric's
 * Definition tab is the Explorer opened on it; its bar holds the definition,
 * filters included. "New metric" opens the same page, empty.
 */
export function SegmentsPrototype() {
  return <SegmentsEditorPrototype placement="inline" />;
}

/** Variant: a pill's segments live in the panel under the bar, the pill shows a count. */
export function PillFiltersPrototype() {
  return <SegmentsEditorPrototype placement="panel" />;
}

/** Variant: no Dimensions tab; the chart takes half and the dimensions, mapped per measure, the other half. */
export function DimensionsSidePanelPrototype() {
  return (
    <SegmentsEditorPrototype
      placement="panel"
      withSidePanel
      defaultExampleId="revenue-per-new-customer"
    />
  );
}

function SegmentsEditorPrototype({
  placement,
  withSidePanel = false,
  defaultExampleId = EXAMPLES[0].id,
}: {
  placement: SegmentPlacement;
  withSidePanel?: boolean;
  defaultExampleId?: string;
}) {
  const sources = useSourceItems();
  const { metrics, isLoading } = sources;
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const [view, setView] = useState<"list" | "metric">("metric");
  /** The segment catalog, with the ones created here. */
  const [segments, setSegments] = useState<Segment[]>(SEGMENTS);
  const tableOf = (id: string) => MEASURE_TABLES[sources.nameOf(id)];
  /** Saved definitions, by metric id or by the new metric's name. */
  const [saved, setSaved] = useState<Record<string, MetricDraft>>({});

  const param = new URLSearchParams(search).get("metric");
  const isNew = param === NEW || (param?.startsWith(`${NEW}-`) ?? false);
  const selected = metrics.find((card) => String(card.id) === param);
  const example = EXAMPLES.find(({ id }) => `${EXAMPLE}${id}` === param);

  // Drop the Explorer's hash so each metric opens fresh.
  const open = (next: string) => {
    setView("metric");
    navigate(`${pathname}?metric=${next}`);
  };

  useEffect(() => {
    if (view === "metric" && !isNew && !selected && !example) {
      navigate(`${pathname}?metric=${EXAMPLE}${defaultExampleId}`, {
        replace: true,
      });
    }
  }, [view, isNew, selected, example, pathname, navigate, defaultExampleId]);

  const savedDraft = param ? saved[param] : undefined;
  const missingMeasures = example ? sources.missingFor(example) : [];

  return (
    <Stack gap="sm">
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <ExamplesBar
          activeId={example?.id}
          onSelect={(id) => open(`${EXAMPLE}${id}`)}
        />
        <Group gap="sm" wrap="nowrap">
          <SegmentedControl
            value={view}
            onChange={(value) => setView(value === "list" ? "list" : "metric")}
            data={[
              { value: "list", label: "Metrics page" },
              { value: "metric", label: "Definition tab" },
            ]}
          />
        </Group>
      </Group>
      <Box
        bd="1px solid var(--mb-color-border-neutral)"
        style={{ borderRadius: 8, overflow: "hidden" }}
      >
        {isLoading ? (
          <Loader m="xl" />
        ) : view === "list" ? (
          <MetricsList
            metrics={metrics}
            onNew={() => open(`${NEW}-${newKey()}`)}
            onOpen={(id) => open(String(id))}
          />
        ) : missingMeasures.length > 0 ? (
          <MissingMeasures names={missingMeasures} />
        ) : isNew || selected || example ? (
          <MetricEditorPage
            key={param}
            cardId={
              selected?.id ??
              metrics.find((m) => m.name === example?.name)?.id ??
              metrics[0]?.id
            }
            collection={selected?.collection?.name ?? "Our analytics"}
            isNew={isNew && savedDraft == null}
            initial={
              savedDraft ??
              (example
                ? toSegments(
                    exampleDraft(example, sources.idOf),
                    segments,
                    tableOf,
                  )
                : selected
                  ? initialDraftFor(selected, sources.measures)
                  : EMPTY_DRAFT)
            }
            items={sources.items}
            nameOf={sources.nameOf}
            resolver={sources.resolver}
            onSave={(draft) =>
              param && setSaved((prev) => ({ ...prev, [param]: draft }))
            }
            onCancelNew={() => setView("list")}
            placement={placement}
            withSidePanel={withSidePanel}
            segments={segments}
            onCreateSegment={(segment) =>
              setSegments((prev) => [...prev, segment])
            }
          />
        ) : (
          <Text p="xl" c="text-secondary">
            No metrics in this instance yet. Create one from the Metrics page.
          </Text>
        )}
      </Box>
    </Stack>
  );
}

function MetricEditorPage({
  cardId,
  collection,
  isNew,
  initial,
  items,
  nameOf,
  resolver,
  onSave,
  onCancelNew,
  placement,
  withSidePanel,
  segments,
  onCreateSegment,
}: {
  placement: SegmentPlacement;
  withSidePanel: boolean;
  segments: Segment[];
  onCreateSegment: (segment: Segment) => void;
  cardId: CardType["id"] | undefined;
  collection: string;
  isNew: boolean;
  initial: MetricDraft;
  items: BarItem[];
  nameOf: (id: string) => string;
  resolver: Resolver;
  onSave: (draft: MetricDraft) => void;
  onCancelNew: () => void;
}) {
  const [base, setBase] = useState(initial);
  const [draft, setDraft] = useState(initial);
  // Remounts the name field and the bar on Cancel, so they show `base` again.
  const [revision, setRevision] = useState(0);
  const [tab, setTab] = useState("Definition");
  const [columns, setColumns] = useState<ColumnMapping>(EMPTY_COLUMN_MAPPING);
  const tabs = (isNew ? NEW_TABS : TABS).filter(
    (label) => !withSidePanel || label !== "Dimensions",
  );

  const isDirty = isNew || signature(draft) !== signature(base);
  const filterProblem = findFilterProblem(
    expandSegments(draft, segments),
    resolver,
  );
  const problem =
    draft.name.trim() === ""
      ? "Give the metric a name"
      : !isComplete(draft.formula) || findProblem(draft.formula, nameOf) != null
        ? "Finish the definition"
        : filterProblem != null
          ? "Fix the filters"
          : undefined;

  const handleCancel = () => {
    if (isNew) {
      onCancelNew();
      return;
    }
    setDraft(base);
    setRevision((r) => r + 1);
  };

  const handleSave = () => {
    setBase(draft);
    onSave(draft);
  };

  return (
    <PageContainer pt="md" h="auto">
      <PaneHeader
        icon="metric"
        breadcrumbs={
          <Breadcrumbs
            separator={<Icon size={12} name="chevronright" />}
            fz="sm"
            c="text-secondary"
          >
            <Text size="sm" c="inherit">
              {collection}
            </Text>
          </Breadcrumbs>
        }
        title={
          isNew ? (
            <PaneHeaderInput
              key={revision}
              initialValue={draft.name}
              placeholder="New metric"
              onContentChange={(name) => setDraft((d) => ({ ...d, name }))}
            />
          ) : (
            <PanelHeaderTitle>{base.name}</PanelHeaderTitle>
          )
        }
        tabs={
          <PillTabNavigation
            tabs={tabs.map((label) => ({
              label,
              onClick: () => setTab(label),
              isSelected: label === tab,
            }))}
          />
        }
        menu={
          isNew ? undefined : (
            <Group gap="xs" wrap="nowrap">
              <ActionIcon variant="subtle" c="text-secondary">
                <Icon name="bookmark" />
              </ActionIcon>
              <ActionIcon variant="subtle" c="text-secondary">
                <Icon name="ellipsis" />
              </ActionIcon>
            </Group>
          )
        }
        actions={
          <PaneHeaderActions
            isDirty={isDirty}
            isValid={problem == null}
            errorMessage={problem}
            onSave={handleSave}
            onCancel={handleCancel}
          />
        }
      />
      {tab === "Dimensions" ? (
        <DimensionsTab
          pills={pillsOf(draft, resolver)}
          dimensions={metricDimensions(draft, resolver)}
          mapping={draft.mapping}
          onChange={(mapping) => setDraft((d) => ({ ...d, mapping }))}
        />
      ) : (
        isRealTab(tab) &&
        !isNew && <MetricTabContent tab={tab} cardId={cardId} />
      )}
      <Card
        withBorder
        shadow="none"
        p={0}
        h={withSidePanel ? 720 : 680}
        display={tab === "Definition" ? undefined : "none"}
      >
        <EmbeddedExplorer
          sidePanel={
            withSidePanel ? (
              <DimensionsSidePanel
                pills={pillsOf(draft, resolver)}
                dimensions={metricDimensions(draft, resolver)}
                mapping={draft.mapping}
                columns={columns}
                onChangeMapping={(mapping) =>
                  setDraft((d) => ({ ...d, mapping }))
                }
                onChangeColumns={setColumns}
              />
            ) : undefined
          }
          key={revision}
          draft={draft}
          items={items}
          nameOf={nameOf}
          resolver={resolver}
          filterProblem={filterProblem}
          placement={placement}
          segments={segments}
          onCreateSegment={onCreateSegment}
          onChange={setDraft}
        />
      </Card>
    </PageContainer>
  );
}

const parseSourceId = (id: string) => {
  const [sourceType, rawId] = id.split(":");
  return {
    id: Number(rawId),
    sourceType: sourceType === "metric" ? "metric" : "measure",
  } as const;
};

const toSourceId = (id: string): MetricSourceId => {
  const source = parseSourceId(id);
  return source.sourceType === "metric"
    ? `metric:${source.id}`
    : `measure:${source.id}`;
};

/**
 * The flattened definition as the Explorer's formula: one source, or one
 * expression. Each measure already carries every filter that applies to it.
 */
function toFormulaEntities(
  formula: FormulaToken[],
  name: string,
  baseDefinition: (id: string) => LibMetric.MetricDefinition | null,
): MetricsViewerFormulaEntity[] {
  const filtered = ({
    measureId,
    filters,
  }: FormulaToken & { kind: "term" }) => {
    const base = baseDefinition(measureId);
    return base && filters.length > 0 ? applyFilters(base, filters) : null;
  };
  const isSingleTerm = formula.length === 1 && formula[0].kind === "term";
  if (isSingleTerm && formula[0].kind === "term") {
    return [
      {
        type: "metric",
        id: toSourceId(formula[0].measureId),
        definition: filtered(formula[0]),
      },
    ];
  }
  const tokens = formula.map((token): ExpressionSubToken => {
    switch (token.kind) {
      case "term":
        return {
          type: "metric",
          sourceId: toSourceId(token.measureId),
          occurrenceCount: 0,
          definition: filtered(token) ?? undefined,
        };
      case "op":
        return { type: "operator", op: OP_TO_MATH[token.op] };
      case "paren":
        return { type: token.side === "(" ? "open-paren" : "close-paren" };
    }
  });
  return [
    {
      id: "expression:draft",
      type: "expression",
      name: name || "New metric",
      tokens: stampMetricCounts(tokens),
    },
  ];
}

/**
 * The real Explorer with our definition bar in place of its search bar and
 * Filter button. Everything under the bar is the Explorer's own.
 */
function EmbeddedExplorer({
  draft,
  items,
  nameOf,
  resolver,
  filterProblem,
  placement,
  segments,
  onCreateSegment,
  onChange,
  sidePanel,
}: {
  sidePanel?: ReactNode;
  placement: SegmentPlacement;
  segments: Segment[];
  onCreateSegment: (segment: Segment) => void;
  draft: MetricDraft;
  items: BarItem[];
  nameOf: (id: string) => string;
  resolver: Resolver;
  filterProblem: FormulaProblem | null;
  onChange: (draft: MetricDraft) => void;
}) {
  const viewerState = useViewerState();
  const {
    initialLoadComplete,
    definitions,
    addMetric,
    removeMetric,
    setFormulaEntities,
  } = viewerState;
  /** The pill a New segment is being made for, and its suggested name. */
  const [newSegment, setNewSegment] = useState<{
    termKey: string;
    name: string;
  } | null>(null);

  // Math over measures only: metrics that are math themselves are replaced
  // by their parts, and each measure carries every filter that applies to it.
  const flat = flattenDraft(expandSegments(draft, segments), resolver);
  const sourceIds = [
    ...new Set(
      flat.flatMap((token) => (token.kind === "term" ? [token.measureId] : [])),
    ),
  ];
  const loadedCount = sourceIds.filter(
    (id) => definitions[toSourceId(id)]?.definition != null,
  ).length;
  const isValid =
    isComplete(draft.formula) &&
    findProblem(draft.formula, nameOf) == null &&
    filterProblem == null;
  const draftKey = JSON.stringify(flat.map(({ key: _, ...token }) => token));
  const hasFilters = flat.some(
    (token) => token.kind === "term" && token.filters.length > 0,
  );
  const isLoaded = loadedCount === sourceIds.length;

  const dimensions = metricDimensions(draft, resolver);
  const namePills = ({ unshared }: MetricDimensions) =>
    unshared.map(({ dimension, pills }) => ({ label: dimension.label, pills }));
  const whereFilters = (query: string, exclude: string[]) =>
    suggestFilters(dimensions.mapped, query, exclude, {
      section: "Dimensions of this metric",
      unshared: namePills(dimensions),
    });
  const filtersForTerm = (id: string, query: string, exclude: string[]) => {
    const inner = resolver.inner(id);
    return suggestFilters(
      pillOf(id, resolver)?.dimensions ?? [],
      query,
      exclude,
      inner
        ? {
            hint: "Only the dimensions its measures share. To filter one of them, add it to the formula on its own.",
            unshared: namePills(metricDimensions(inner, resolver)),
          }
        : { first: MEASURE_COLUMNS[nameOf(id)], alias: nameOf(id) },
    );
  };

  /** Segments of the pill's table; for a metric over tables, the ones its dimensions fit. */
  const availableSegments = (id: string) => {
    const table = MEASURE_TABLES[nameOf(id)];
    if (table) {
      return segments.filter((segment) => segment.table === table);
    }
    const labels = (pillOf(id, resolver)?.dimensions ?? []).map(
      (dimension) => dimension.label,
    );
    return segments.filter((segment) =>
      segment.conditions.every((condition) => {
        const label = dimensionLabelOf(condition);
        return label != null && labels.includes(label);
      }),
    );
  };
  const segmentsForTerm = (id: string, query: string, exclude: string[]) =>
    segmentItems(availableSegments(id), query, exclude);
  const segmentName = (id: string) =>
    segments.find((segment) => segment.id === id)?.name ?? id;
  const newSegmentTerm = draft.formula.find(
    (token) => token.kind === "term" && token.key === newSegment?.termKey,
  );

  // Load what the bar references and unload what it dropped; then hand the
  // Explorer the formula. Re-run once everything loaded, so the Explorer
  // picks its default dimensions from loaded definitions.
  useEffect(() => {
    if (!initialLoadComplete) {
      return;
    }
    for (const id of sourceIds) {
      const source = parseSourceId(id);
      addMetric({ ...source, name: nameOf(id) });
    }
    for (const id of Object.keys(definitions)) {
      if (!sourceIds.includes(id)) {
        const source = parseSourceId(id);
        removeMetric(source.id, source.sourceType);
      }
    }
    // Filters need the measures' definitions; wait for them.
    if (isValid && (isLoaded || !hasFilters)) {
      setFormulaEntities(
        toFormulaEntities(
          flat,
          draft.name,
          (id) => definitions[toSourceId(id)]?.definition ?? null,
        ),
      );
    } else if (draft.formula.length === 0) {
      setFormulaEntities([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the formula's content
  }, [initialLoadComplete, draftKey, loadedCount, isValid]);

  if (!initialLoadComplete) {
    return (
      <Center h="100%">
        <Loader />
      </Center>
    );
  }

  return (
    <MetricsViewerProvider value={viewerState}>
      <Stack px="3rem" h="100%" gap={0} className={PageS.root}>
        <Box pt="lg" flex="0 0 auto">
          {
            <DefinitionEditor
              draft={draft}
              onChange={onChange}
              measureItems={items}
              measureName={nameOf}
              whereFilters={whereFilters}
              segmentsForTerm={segmentsForTerm}
              segmentName={segmentName}
              onNewSegment={(termKey, name) => setNewSegment({ termKey, name })}
              extraProblem={filterProblem}
              placement={placement}
            />
          }
        </Box>
        {newSegment && newSegmentTerm?.kind === "term" && (
          <NewSegmentModal
            initialName={newSegment.name}
            table={
              MEASURE_TABLES[nameOf(newSegmentTerm.measureId)] ??
              nameOf(newSegmentTerm.measureId)
            }
            getItems={(query, exclude) =>
              filtersForTerm(newSegmentTerm.measureId, query, exclude)
            }
            onClose={() => setNewSegment(null)}
            onSave={(segment) => {
              onCreateSegment(segment);
              onChange({
                ...draft,
                formula: draft.formula.map((token) =>
                  token.key === newSegmentTerm.key && token.kind === "term"
                    ? { ...token, filters: [...token.filters, segment.id] }
                    : token,
                ),
              });
              setNewSegment(null);
            }}
          />
        )}
        {sidePanel ? (
          <Flex flex="1 1 auto" mih={0} mx="-3rem" mt="md">
            <Flex w="66.67%" px="lg" miw={0} direction="column">
              <ExplorerBody withoutSidebar />
            </Flex>
            <Box
              w="33.33%"
              miw={0}
              style={{ borderLeft: "1px solid var(--mb-color-border-neutral)" }}
            >
              {sidePanel}
            </Box>
          </Flex>
        ) : (
          <ExplorerBody />
        )}
      </Stack>
    </MetricsViewerProvider>
  );
}

/** MetricsViewerPage's body without its search panel. */
function ExplorerBody({
  withoutSidebar = false,
}: {
  withoutSidebar?: boolean;
}) {
  const { definitions, activeDimensionBreakout, isSidebarOpen, metricSlots } =
    useMetricsViewerContext();
  // The breakout is set in the dimensions panel: under the chart it's a label.
  const breakoutLabel =
    activeDimensionBreakout && activeDimensionBreakout.type !== "scalar"
      ? getDimensionBreakoutLabel(
          activeDimensionBreakout,
          definitions,
          metricSlots,
        )
      : null;
  // CSSProperties has no index signature for custom properties.
  const labelStyle = {
    "--breakout-label": JSON.stringify(breakoutLabel ?? ""),
  } as CSSProperties;

  const hasDefinitions = Object.keys(definitions).length > 0;
  const hasLoadedDefinitions = Object.values(definitions).some(
    (entry) => entry.definition != null,
  );
  const showDimensionPickerSidebar =
    !withoutSidebar && isSidebarOpen && activeDimensionBreakout;
  const showBreakoutLegend =
    !showDimensionPickerSidebar && activeDimensionBreakout?.type !== "scalar";

  return (
    <Flex flex="1 1 auto" mih={0} pt="md">
      <Flex
        direction="column"
        pt="lg"
        pb="xl"
        flex={1}
        miw={0}
        className={cx(PageS.content, { [S.staticBreakout]: withoutSidebar })}
        style={withoutSidebar ? labelStyle : undefined}
      >
        {!hasDefinitions ? (
          <MetricsViewerEmptyState />
        ) : activeDimensionBreakout ? (
          <MetricsViewerDimensionBreakoutContent />
        ) : hasLoadedDefinitions ? (
          <MetricsViewerNoDimensionBreakoutEmptyState />
        ) : null}
      </Flex>
      {showBreakoutLegend && <BreakoutLegend />}
      {showDimensionPickerSidebar && (
        <DimensionPickerSidebar
          activeDimensionBreakout={activeDimensionBreakout}
        />
      )}
    </Flex>
  );
}
