/* eslint-disable boundaries/element-types -- throwaway prototype: embeds the real Metric Explorer's parts. */
import { useCallback, useEffect, useMemo, useState } from "react";

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

import { DefinitionEditor, type PillActions } from "./DefinitionEditor";
import { DimensionsTab } from "./DimensionsTab";
import { EXAMPLE_PARAM_PREFIX, ExamplesBar } from "./ExamplesBar";
import { MetricsList, useMetrics } from "./MetricExplorerPrototype";
import { MissingMeasures } from "./MissingMeasures";
import type { BarItem } from "./TokenBar";
import {
  MEASURE_COLUMNS,
  MEASURE_TABLES,
  SEGMENTS,
  type SegmentSpec,
} from "./catalog";
import {
  EMPTY_MAPPING,
  type MetricDimensions,
  type Resolver,
  findFilterProblem,
  flattenDraft,
  metricDimensions,
  pillOf,
  pillsOf,
  tableDimensions,
  tablesOf,
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

const TABS = ["About", "Overview", "Definition", "Dimensions", "Dependencies"];
const NEW_TABS = ["Definition", "Dimensions"];

const PILL_ACTIONS: { value: PillActions; label: string }[] = [
  { value: "inline", label: "Inline icon" },
  { value: "menu", label: "Pill menu" },
  { value: "chip", label: "Hover chip" },
];
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
function useSourceItems(segments: SegmentSpec[]) {
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
      segment: (name) =>
        segments.find((segment) => segment.name === name) ?? null,
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
  }, [items, measures, metrics, idOf, segments]);

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
export function MetricEditorPrototype() {
  // The catalog's segments, plus the filters named in this session.
  const [segments, setSegments] = useState(SEGMENTS);
  const sources = useSourceItems(segments);
  const { metrics, isLoading } = sources;
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const [view, setView] = useState<"list" | "metric">("metric");
  /** Prototype: the two ways a pill offers to filter its measure, to compare. */
  const [pillActions, setPillActions] = useState<PillActions>("inline");
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
      navigate(`${pathname}?metric=${EXAMPLE}${EXAMPLES[0].id}`, {
        replace: true,
      });
    }
  }, [view, isNew, selected, example, pathname, navigate]);

  const savedDraft = param ? saved[param] : undefined;
  const missingMeasures = example ? sources.missingFor(example) : [];

  return (
    <Stack gap="sm">
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <ExamplesBar
          activeId={example?.id}
          onSelect={(id) => open(`${EXAMPLE}${id}`)}
        />
        <Group gap="sm" wrap="nowrap" flex="none">
          <SegmentedControl
            value={pillActions}
            onChange={(value) =>
              setPillActions(
                PILL_ACTIONS.find((option) => option.value === value)?.value ??
                  "inline",
              )
            }
            data={PILL_ACTIONS}
          />
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
                ? exampleDraft(example, sources.idOf)
                : selected
                  ? initialDraftFor(selected, sources.measures)
                  : EMPTY_DRAFT)
            }
            items={sources.items}
            nameOf={sources.nameOf}
            resolver={sources.resolver}
            segments={segments}
            onCreateSegment={(segment) =>
              setSegments((current) =>
                current.some(({ name }) => name === segment.name)
                  ? current
                  : [...current, segment],
              )
            }
            onSave={(draft) =>
              param && setSaved((prev) => ({ ...prev, [param]: draft }))
            }
            onCancelNew={() => setView("list")}
            pillActions={pillActions}
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
  segments,
  onCreateSegment,
  onSave,
  onCancelNew,
  pillActions,
}: {
  pillActions: PillActions;
  cardId: CardType["id"] | undefined;
  collection: string;
  isNew: boolean;
  initial: MetricDraft;
  items: BarItem[];
  nameOf: (id: string) => string;
  resolver: Resolver;
  segments: SegmentSpec[];
  onCreateSegment: (segment: SegmentSpec) => void;
  onSave: (draft: MetricDraft) => void;
  onCancelNew: () => void;
}) {
  const [base, setBase] = useState(initial);
  const [draft, setDraft] = useState(initial);
  // Remounts the name field and the bar on Cancel, so they show `base` again.
  const [revision, setRevision] = useState(0);
  const [tab, setTab] = useState("Definition");

  const isDirty = isNew || signature(draft) !== signature(base);
  const filterProblem = findFilterProblem(draft, resolver);
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
            tabs={(isNew ? NEW_TABS : TABS).map((label) => ({
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
        h={680}
        display={tab === "Definition" ? undefined : "none"}
      >
        <EmbeddedExplorer
          key={revision}
          draft={draft}
          items={items}
          nameOf={nameOf}
          resolver={resolver}
          segments={segments}
          onCreateSegment={onCreateSegment}
          filterProblem={filterProblem}
          pillActions={pillActions}
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
  segments,
  onCreateSegment,
  filterProblem,
  pillActions,
  onChange,
}: {
  pillActions: PillActions;
  draft: MetricDraft;
  items: BarItem[];
  nameOf: (id: string) => string;
  resolver: Resolver;
  segments: SegmentSpec[];
  onCreateSegment: (segment: SegmentSpec) => void;
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

  // Math over measures only: metrics that are math themselves are replaced
  // by their parts, and each measure carries every filter that applies to it.
  const flat = flattenDraft(draft, resolver);
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
  /** The one table a pill reads, if it reads just one: its segments fit. */
  const tableOf = (id: string) => {
    const pill = pillOf(id, resolver);
    const tables = pill ? tablesOf(pill) : [];
    return tables.length === 1 ? tables[0] : undefined;
  };
  const filtersForTerm = (id: string, query: string, exclude: string[]) => {
    const inner = resolver.inner(id);
    const table = tableOf(id);
    return suggestFilters(
      pillOf(id, resolver)?.dimensions ?? [],
      query,
      exclude,
      {
        segments: segments.filter((segment) => segment.table === table),
        ...(inner
          ? {
              hint:
                table == null
                  ? "Only the dimensions its measures share, and no segments: a segment is on one table. To filter one measure, add it to the formula on its own."
                  : undefined,
              unshared: namePills(metricDimensions(inner, resolver)),
            }
          : { first: MEASURE_COLUMNS[nameOf(id)], alias: nameOf(id) }),
      },
    );
  };

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
              layout="explorer"
              whereFilters={whereFilters}
              filtersForTerm={filtersForTerm}
              extraProblem={filterProblem}
              pillActions={pillActions}
              segmentFilter={(name) => resolver.segment(name)?.filter}
              canNameFilter={(id) => tableOf(id) != null}
              onNameFilter={(id, filter, name) => {
                const table = tableOf(id);
                if (table != null) {
                  onCreateSegment({ name, table, filter });
                }
              }}
            />
          }
        </Box>
        <ExplorerBody />
      </Stack>
    </MetricsViewerProvider>
  );
}

/** MetricsViewerPage's body without its search panel. */
function ExplorerBody() {
  const { definitions, activeDimensionBreakout, isSidebarOpen } =
    useMetricsViewerContext();

  const hasDefinitions = Object.keys(definitions).length > 0;
  const hasLoadedDefinitions = Object.values(definitions).some(
    (entry) => entry.definition != null,
  );
  const showDimensionPickerSidebar = isSidebarOpen && activeDimensionBreakout;
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
        className={PageS.content}
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
