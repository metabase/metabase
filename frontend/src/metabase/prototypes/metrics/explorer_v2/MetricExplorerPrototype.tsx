/* eslint-disable boundaries/element-types -- throwaway prototype: embeds the real Metric Explorer. */
import { useEffect, useMemo, useState } from "react";

import { useListCardsQuery } from "metabase/api";
import { PillTabNavigation } from "metabase/common/components/PillTabNavigation";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import {
  PaneHeader,
  PanelHeaderTitle,
} from "metabase/common/data-studio/components/PaneHeader";
import { MetricsViewerPage } from "metabase/metrics-viewer";
import { useLocation, useNavigate } from "metabase/router";
import {
  ActionIcon,
  Box,
  Breadcrumbs,
  Button,
  Card,
  Flex,
  Group,
  Icon,
  Loader,
  Modal,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";
import type { Card as CardType } from "metabase-types/api";

import LoFi from "../LoFi.module.css";
import { MetricTabContent, isRealTab } from "../MetricTabContent";
import { DIMENSIONS, formatNumber } from "../data";

import { DefinitionEditor } from "./DefinitionEditor";
import { MetricChart } from "./MetricChart";
import { EMPTY_MAPPING } from "./dimensions";
import { EXAMPLES, exampleDraft } from "./examples";
import { type MetricDraft, evaluate, findProblem, isComplete } from "./formula";

/** The editor's examples, on the mock measures (same names, slugged ids). */
const EXAMPLE_FORMULAS = EXAMPLES.map(
  (example) => () =>
    exampleDraft(example, (name) => name.toLowerCase().replace(/ /g, "-")),
);

const TABS = ["About", "Overview", "Explorer", "Dimensions", "Dependencies"];

type ModalState = { mode: "new" } | { mode: "edit"; card: CardType } | null;

export function useMetrics() {
  const { data: cards = [], isLoading } = useListCardsQuery({ f: "all" });
  const metrics = useMemo(
    () => cards.filter((card) => card.type === "metric" && !card.archived),
    [cards],
  );
  return { metrics, isLoading };
}

/**
 * Idea 1: a metric's Definition tab becomes the Metric Explorer, embedded.
 * Defining a metric, new or existing, happens in a large modal: math over
 * measures, each with its own filters.
 */
export function MetricExplorerPrototype() {
  const { metrics, isLoading } = useMetrics();
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const [view, setView] = useState<"list" | "metric">("metric");
  const [modal, setModal] = useState<ModalState>(null);

  const metricId = Number(new URLSearchParams(search).get("metricId"));
  const selected = metrics.find((card) => card.id === metricId);

  // The embedded explorer reads `?metricId=` and keeps its state in the hash.
  const openMetric = (id: number) => {
    setView("metric");
    navigate(`${pathname}?metricId=${id}`);
  };

  useEffect(() => {
    if (view === "metric" && selected == null && metrics.length > 0) {
      navigate(`${pathname}?metricId=${metrics[0].id}`, { replace: true });
    }
  }, [view, selected, metrics, pathname, navigate]);

  const editingIndex =
    modal?.mode === "edit" ? metrics.indexOf(modal.card) : -1;
  const initialDraft: MetricDraft =
    modal?.mode === "edit"
      ? EXAMPLE_FORMULAS[Math.max(editingIndex, 0) % EXAMPLE_FORMULAS.length]()
      : { name: "", formula: [], where: [], mapping: EMPTY_MAPPING };

  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <Text size="sm" c="text-secondary">
          Today’s app around the idea. The Explorer tab is the real Metric
          Explorer on this instance’s metrics. The modal uses the editor’s
          example metrics, with mock numbers.
        </Text>
        <SegmentedControl
          value={view}
          onChange={(value) => setView(value === "list" ? "list" : "metric")}
          data={[
            { value: "list", label: "Metrics page" },
            { value: "metric", label: "A metric’s Explorer tab" },
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
            onNew={() => setModal({ mode: "new" })}
            onOpen={openMetric}
          />
        ) : selected ? (
          <MetricPage
            key={selected.id}
            metric={selected}
            onEdit={() => setModal({ mode: "edit", card: selected })}
          />
        ) : (
          <Text p="xl" c="text-secondary">
            No metrics in this instance yet. Create one from the Metrics page.
          </Text>
        )}
      </Box>
      {modal && (
        <MetricModal
          title={modal.mode === "edit" ? "Edit metric" : "New metric"}
          initial={initialDraft}
          onClose={() => setModal(null)}
          onSave={() => setModal(null)}
        />
      )}
    </Stack>
  );
}

/** Today's Browse › Metrics page: its "+" opens the modal. */
export function MetricsList({
  metrics,
  onNew,
  onOpen,
}: {
  metrics: CardType[];
  onNew: () => void;
  onOpen: (id: number) => void;
}) {
  return (
    <Stack p="xl" gap="lg" maw="64rem" mx="auto" mih={480}>
      <Flex justify="space-between" align="center">
        <Title order={1} c="text-primary">
          <Group gap="sm">
            <Icon size={24} c="icon-brand" name="metric" />
            Metrics
          </Group>
        </Title>
        <Tooltip label="Create a new metric" position="bottom">
          <ActionIcon
            variant="subtle"
            aria-label="Create a new metric"
            onClick={onNew}
          >
            <Icon name="add" />
          </ActionIcon>
        </Tooltip>
      </Flex>
      <Box
        bd="1px solid var(--mb-color-border-neutral)"
        style={{ borderRadius: 8 }}
      >
        <Group
          px="md"
          py="sm"
          c="text-secondary"
          style={{ borderBottom: "1px solid var(--mb-color-border-neutral)" }}
        >
          <Text size="sm" c="inherit" flex={1}>
            Name
          </Text>
          <Text size="sm" c="inherit" w={200}>
            Collection
          </Text>
        </Group>
        {metrics.map((metric) => (
          <UnstyledButton
            key={metric.id}
            w="100%"
            px="md"
            py="sm"
            onClick={() => onOpen(metric.id)}
          >
            <Group>
              <Group gap="sm" flex={1}>
                <Icon name="metric" c="icon-brand" />
                <Text fw={700}>{metric.name}</Text>
              </Group>
              <Text c="text-secondary" w={200}>
                {metric.collection?.name ?? "Our analytics"}
              </Text>
            </Group>
          </UnstyledButton>
        ))}
      </Box>
    </Stack>
  );
}

/** Today's metric page; its Explorer tab embeds the real Metric Explorer. */
function MetricPage({
  metric,
  onEdit,
}: {
  metric: CardType;
  onEdit: () => void;
}) {
  const [tab, setTab] = useState("Explorer");
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
              {metric.collection?.name ?? "Our analytics"}
            </Text>
          </Breadcrumbs>
        }
        title={<PanelHeaderTitle>{metric.name}</PanelHeaderTitle>}
        tabs={
          <Group justify="space-between" w="100%" wrap="nowrap">
            <PillTabNavigation
              tabs={TABS.map((label) => ({
                label,
                onClick: () => setTab(label),
                isSelected: label === tab,
              }))}
            />
            <Tooltip label="Edit metric">
              <ActionIcon
                variant="subtle"
                aria-label="Edit metric"
                onClick={onEdit}
              >
                <Icon name="pencil" />
              </ActionIcon>
            </Tooltip>
          </Group>
        }
        menu={
          <Group gap="xs" wrap="nowrap">
            <ActionIcon variant="subtle" c="text-secondary">
              <Icon name="bookmark" />
            </ActionIcon>
            <ActionIcon variant="subtle" c="text-secondary">
              <Icon name="ellipsis" />
            </ActionIcon>
          </Group>
        }
      />
      {isRealTab(tab) && <MetricTabContent tab={tab} cardId={metric.id} />}
      <Card
        withBorder
        shadow="none"
        p={0}
        h={640}
        display={tab === "Explorer" ? undefined : "none"}
      >
        <MetricsViewerPage />
      </Card>
    </PageContainer>
  );
}

/** The large modal where a metric is defined: new, or an edit. */
function MetricModal({
  title,
  initial,
  onClose,
  onSave,
}: {
  title: string;
  initial: MetricDraft;
  onClose: () => void;
  onSave: (draft: MetricDraft) => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [dimension, setDimension] = useState(DIMENSIONS[0]);
  const values = useMemo(() => evaluate(draft), [draft]);
  const canSave =
    draft.name.trim() !== "" &&
    isComplete(draft.formula) &&
    findProblem(draft.formula) == null;

  return (
    <Modal
      opened
      onClose={onClose}
      title={title}
      size="calc(100vw - 8rem)"
      styles={{ body: { padding: 0 } }}
    >
      <Stack gap={0} h="calc(100vh - 12rem)">
        <Stack
          gap="xl"
          p="xl"
          flex={1}
          mih={0}
          className={LoFi.lofi}
          style={{ overflow: "auto" }}
        >
          <TextInput
            label="Name"
            placeholder="Gross profit"
            maw={360}
            value={draft.name}
            onChange={(event) =>
              setDraft({ ...draft, name: event.target.value })
            }
          />
          <DefinitionEditor draft={draft} onChange={setDraft} />
          <Stack
            gap="md"
            p="lg"
            bd="1px solid var(--mb-color-border-neutral)"
            style={{ borderRadius: 8 }}
          >
            <Group justify="space-between" align="flex-start">
              <Box>
                <Text size="xs" c="text-secondary">
                  {(draft.name || "New metric").toUpperCase()} · LAST 12 MONTHS
                </Text>
                <Text fw={700} size="xl">
                  {values
                    ? formatNumber(values.reduce((a, b) => a + b, 0))
                    : "—"}
                </Text>
              </Box>
              <SegmentedControl
                value={dimension}
                onChange={setDimension}
                data={DIMENSIONS.map((d) => ({ value: d, label: d }))}
              />
            </Group>
            {values ? (
              <MetricChart values={values} dimension={dimension} />
            ) : (
              <Text c="text-secondary" py="xl" ta="center">
                {draft.formula.length === 0
                  ? "Add a measure to see a preview."
                  : "Finish the definition to see a preview."}
              </Text>
            )}
          </Stack>
        </Stack>
        <Group
          justify="flex-end"
          p="md"
          style={{ borderTop: "1px solid var(--mb-color-border-neutral)" }}
        >
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="filled"
            disabled={!canSave}
            onClick={() => onSave(draft)}
          >
            Save
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
