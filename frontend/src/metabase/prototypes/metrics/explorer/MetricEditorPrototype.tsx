/* eslint-disable boundaries/element-types -- throwaway prototype: embeds the real Metric Explorer's parts. */
import { useEffect, useMemo, useState } from "react";

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

import { DefinitionEditor } from "./DefinitionEditor";
import { EXAMPLE_PARAM_PREFIX, ExamplesBar } from "./ExamplesBar";
import { MetricsList, useMetrics } from "./MetricExplorerPrototype";
import type { BarItem } from "./TokenBar";
import {
  EXAMPLES,
  MEASURE_TABLES,
  type MetricExample,
  applyFilters,
  exampleDraft,
  filterItemsFor,
} from "./examples";
import {
  type FormulaToken,
  type MetricDraft,
  type Op,
  findProblem,
  isComplete,
  newKey,
} from "./formula";

const TABS = ["About", "Overview", "Definition", "Dimensions", "Dependencies"];
const NEW = "new";
const EXAMPLE = EXAMPLE_PARAM_PREFIX;

const OP_TO_MATH: Record<Op, MathOperator> = {
  "+": "+",
  "−": "-",
  "×": "*",
  "÷": "/",
};

const EMPTY_DRAFT: MetricDraft = { name: "", formula: [], where: [] };

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
          icon: "sum",
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
    return [...measureItems, ...metricItems];
  }, [measures, metrics]);

  const nameOf = (id: string) =>
    items.find((item) => item.id === id)?.label ?? id;
  const tableOf = (id: string) =>
    items.find((item) => item.id === id && item.icon === "sum")?.section;
  const idOf = (measureName: string) =>
    `measure:${measures.find((m) => m.name === measureName)?.id}`;
  /** The example's measures this instance doesn't have, by name. */
  const missingFor = (example: MetricExample) =>
    [
      ...new Set(
        example.formula.flatMap((part) =>
          typeof part === "object" ? [part.measure] : [part],
        ),
      ),
    ].filter(
      (name) =>
        name in MEASURE_TABLES &&
        !measures.some((m) => m.name === name && !m.archived),
    );

  return {
    metrics,
    measures,
    items,
    nameOf,
    tableOf,
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
  };
}

/** Comparable form of a draft, without the tokens' keys. */
const signature = ({ name, formula, where }: MetricDraft) =>
  JSON.stringify({
    name,
    formula: formula.map(({ key: _, ...token }) => token),
    where: where.map(({ filter }) => filter),
  });

/**
 * Metrics 3.0: the Metric Explorer is the metric editor. A metric's
 * Definition tab is the Explorer opened on it; its bar holds the definition,
 * filters included. "New metric" opens the same page, empty.
 */
export function MetricEditorPrototype() {
  const sources = useSourceItems();
  const { metrics, isLoading } = sources;
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const [view, setView] = useState<"list" | "metric">("metric");
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
        <SegmentedControl
          value={view}
          onChange={(value) => setView(value === "list" ? "list" : "metric")}
          data={[
            { value: "list", label: "Metrics page" },
            { value: "metric", label: "A metric’s Definition tab" },
          ]}
        />
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
            tableOf={sources.tableOf}
            onSave={(draft) =>
              param && setSaved((prev) => ({ ...prev, [param]: draft }))
            }
            onCancelNew={() => setView("list")}
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

/** The examples use Sample Database measures made by hand on each instance. */
function MissingMeasures({ names }: { names: string[] }) {
  return (
    <Stack p="xl" gap="sm">
      <Text fw="bold">
        This example needs measures this instance doesn’t have
      </Text>
      <Text c="text-secondary">
        Create them in Data Studio on the Sample Database, with these exact
        names, then reload:
      </Text>
      <Stack gap={4} component="ul" m={0} pl="lg">
        {names.map((name) => (
          <Text component="li" key={name}>
            <strong>{name}</strong>, on the {MEASURE_TABLES[name]} table
          </Text>
        ))}
      </Stack>
    </Stack>
  );
}

function MetricEditorPage({
  collection,
  isNew,
  initial,
  items,
  nameOf,
  tableOf,
  onSave,
  onCancelNew,
}: {
  collection: string;
  isNew: boolean;
  initial: MetricDraft;
  items: BarItem[];
  nameOf: (id: string) => string;
  tableOf: (id: string) => string | undefined;
  onSave: (draft: MetricDraft) => void;
  onCancelNew: () => void;
}) {
  const [base, setBase] = useState(initial);
  const [draft, setDraft] = useState(initial);
  // Remounts the name field and the bar on Cancel, so they show `base` again.
  const [revision, setRevision] = useState(0);

  const isDirty = isNew || signature(draft) !== signature(base);
  const problem =
    draft.name.trim() === ""
      ? "Give the metric a name"
      : !isComplete(draft.formula) || findProblem(draft.formula, nameOf) != null
        ? "Finish the definition"
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
            tabs={(isNew ? ["Definition"] : TABS).map((label) => ({
              label,
              onClick: () => undefined,
              isSelected: label === "Definition",
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
      <Card withBorder shadow="none" p={0} h={680}>
        <EmbeddedExplorer
          key={revision}
          draft={draft}
          items={items}
          nameOf={nameOf}
          tableOf={tableOf}
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

/** The bar's tokens as the Explorer's formula: one source, or one expression. */
function toFormulaEntities(
  { formula, where, name }: MetricDraft,
  baseDefinition: (id: string) => LibMetric.MetricDefinition | null,
): MetricsViewerFormulaEntity[] {
  const wheres = where.map(({ filter }) => filter);
  // The measure's own filters, then the Where row's, as real filter clauses.
  const filtered = (token: FormulaToken & { kind: "term" }) => {
    const base = baseDefinition(token.measureId);
    const filters = [...token.filters, ...wheres];
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
  tableOf,
  onChange,
}: {
  draft: MetricDraft;
  items: BarItem[];
  nameOf: (id: string) => string;
  tableOf: (id: string) => string | undefined;
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

  const sourceIds = [
    ...new Set(
      draft.formula.flatMap((token) =>
        token.kind === "term" ? [token.measureId] : [],
      ),
    ),
  ];
  const loadedCount = sourceIds.filter(
    (id) => definitions[toSourceId(id)]?.definition != null,
  ).length;
  const isValid =
    isComplete(draft.formula) && findProblem(draft.formula, nameOf) == null;
  const draftKey = JSON.stringify({
    formula: draft.formula.map(({ key: _, ...token }) => token),
    where: draft.where.map(({ filter }) => filter),
  });
  const hasFilters =
    draft.where.length > 0 ||
    draft.formula.some(
      (token) => token.kind === "term" && token.filters.length > 0,
    );
  const isLoaded = loadedCount === sourceIds.length;
  const tables = [...new Set(sourceIds.flatMap((id) => tableOf(id) ?? []))];

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
          draft,
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
          <Text fw={700} size="lg" mb="md">
            Definition
          </Text>
          <DefinitionEditor
            draft={draft}
            onChange={onChange}
            measureItems={items}
            measureName={nameOf}
            layout="explorer"
            filterItems={filterItemsFor(tables)}
            filtersForTerm={(id) => filterItemsFor([tableOf(id) ?? ""])}
          />
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
