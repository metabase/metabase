/* eslint-disable boundaries/element-types -- throwaway prototype: drives the Metric Explorer's chart. */
import cx from "classnames";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { MetricDimensionSelect } from "metabase/metrics-viewer/components/DimensionPickerSidebar/components/MetricDimensionSelect";
import { useMetricsViewerContext } from "metabase/metrics-viewer/context";
import { getDimensionBreakoutConfig } from "metabase/metrics-viewer/utils";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Flex,
  Group,
  HoverCard,
  Icon,
  Input,
  Loader,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";

import S from "./DimensionsPanel.module.css";
import {
  type MetricDimension,
  type PanelMapping,
  type PanelModel,
  type PanelPill,
  type PillDimension,
  addDimension,
  isUsed,
  mapDimension,
  moveDimension,
  pickField,
  removeDimension,
  renameDimension,
  valueOverlap,
} from "./panelModel";

type Status = "mapped" | "removed" | "incomplete";

const PILL_COLORS = [
  "var(--mb-color-accent0)",
  "var(--mb-color-accent1)",
  "var(--mb-color-accent2)",
  "var(--mb-color-accent3)",
];

/** "Orders → User → Source"; a metric's own dimension keeps its name. */
const optionLabel = (option: PillDimension) => {
  const fields = Object.values(option.targets);
  if (fields.length !== 1) {
    return option.name;
  }
  const [field] = fields;
  return [field.table, field.group, field.column]
    .filter((part) => part != null)
    .join(" → ");
};

/**
 * Prototype: the metric's dimensions, next to the chart. Clicking one charts
 * the metric by it, to check it; its row then shows which field each measure
 * reads for it. Nothing here is a view setting but the click itself.
 */
export function DimensionsPanel({
  model,
  mapping,
  onChange,
}: {
  model: PanelModel;
  mapping: PanelMapping;
  onChange: (mapping: PanelMapping) => void;
}) {
  const {
    activeDimensionBreakout: active,
    metricSlots,
    selectDimensionBreakout,
    updateActiveDimensionBreakout,
  } = useMetricsViewerContext();
  /** The dimension the chart is split by. */
  const [openId, setOpenId] = useState<string | null>(null);
  /** The dimension open in the whole panel, from its pencil. */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAll, setIsAll] = useState(false);
  const [search, setSearch] = useState("");
  /** The dimension being dragged, and where it would land. */
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<{
    id: string;
    position: "before" | "after";
  } | null>(null);
  const endDrag = () => {
    setDragId(null);
    setDrop(null);
  };
  // Search only once the list scrolls; it stays while it has text.
  const [list, setList] = useState<HTMLDivElement | null>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  useEffect(() => {
    if (list == null) {
      return;
    }
    const check = () =>
      setIsOverflowing(list.scrollHeight > list.clientHeight + 1);
    const observer = new ResizeObserver(check);
    observer.observe(list);
    Array.from(list.children).forEach((child) => observer.observe(child));
    check();
    return () => observer.disconnect();
    // The list's content is swapped once the measures load.
  }, [list, model.isLoading]);
  const showSearch = isOverflowing || search !== "";
  const matches = (dimension: MetricDimension) =>
    dimension.name.toLowerCase().includes(search.trim().toLowerCase());

  const { pills, mapped, removed, incomplete } = model;
  const isMath = pills.length > 1;

  const fieldFor = (dimension: MetricDimension, sourceId: string) =>
    dimension.targets[sourceId]?.id ?? null;
  const isCharted = (dimension: MetricDimension) =>
    active != null &&
    metricSlots.length > 0 &&
    metricSlots.every(
      (slot) =>
        (active.dimensionMapping[slot.slotIndex] ?? null) ===
        fieldFor(dimension, slot.sourceId),
    );
  const chartable = [...mapped, ...removed];
  const current = [...chartable, ...incomplete].find(
    (dimension) => dimension.id === openId,
  );
  const currentId = current?.id ?? null;

  // Starts on Time, and returns to it when the open dimension is gone, like
  // after a measure left the formula. The Explorer's own first pick can be
  // any date the measures share, like a birth date.
  const fallbackId =
    (mapped.find((dimension) => dimension.origin === "time") ?? mapped[0])
      ?.id ?? null;
  const needsFallback =
    current == null && fallbackId != null && active != null && !model.isLoading;
  useEffect(() => {
    if (needsFallback) {
      setOpenId(fallbackId);
    }
  }, [needsFallback, fallbackId]);

  /** Charts the metric by the dimension. A view of the draft, not part of it. */
  const preview = (dimension: MetricDimension) => {
    const dimensionMapping = Object.fromEntries(
      metricSlots.map((slot) => [
        slot.slotIndex,
        fieldFor(dimension, slot.sourceId),
      ]),
    );
    const isSameKind =
      active?.type === dimension.type &&
      getDimensionBreakoutConfig(dimension.type).matchMode === "aggregate";
    if (isSameKind) {
      updateActiveDimensionBreakout((previous) => ({
        ...previous,
        dimensionMapping,
        label: dimension.name,
      }));
    } else {
      selectDimensionBreakout({
        type: dimension.type,
        label: dimension.name,
        dimensionMapping,
      });
    }
  };

  // The chart follows the open row: when another one opens, and when the
  // open one gets a different field. Keyed, so it never asks twice.
  const chartKey =
    openId != null && current != null && current.missing.length === 0
      ? JSON.stringify([
          openId,
          metricSlots.map((slot) => fieldFor(current, slot.sourceId)),
        ])
      : null;
  // Also when the Explorer picks a breakout of its own again, as it does
  // once the measures have loaded. Bounded, in case it never takes ours.
  const isShown = current != null && isCharted(current);
  const attempts = useRef({ key: "", count: 0 });
  useEffect(() => {
    if (chartKey == null || current == null || isShown) {
      return;
    }
    if (attempts.current.key !== chartKey) {
      attempts.current = { key: chartKey, count: 0 };
    }
    if (attempts.current.count < 3) {
      attempts.current.count += 1;
      preview(current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the open row's fields
  }, [chartKey, isShown]);

  /** A click on a name charts by it. */
  const select = (dimension: MetricDimension) => setOpenId(dimension.id);
  /** The pencil opens the dimension in the whole panel, and charts by it. */
  const edit = (id: string) => {
    setOpenId(id);
    setEditingId(id);
  };

  const handleRemove = (dimension: MetricDimension) => {
    onChange(removeDimension(mapping, dimension));
    if (dimension.id === currentId) {
      const fallback =
        mapped.find(
          (other) => other.origin === "time" && other !== dimension,
        ) ?? mapped.find((other) => other !== dimension);
      setOpenId(fallback?.id ?? null);
    }
    setEditingId(null);
  };

  const handleAdd = (seed?: { pillId: string; pillDimensionId: string }) => {
    const next = addDimension(mapping, seed);
    onChange(next.mapping);
    edit(next.id);
    setIsAll(false);
  };

  const section = (
    title: string,
    status: Status,
    all: MetricDimension[],
    action?: ReactNode,
  ) => {
    const shown = all.filter(matches);
    if (shown.length === 0) {
      return null;
    }
    return (
      <Section title={title} count={all.length} action={action}>
        {shown.map((dimension) => (
          <DimensionRow
            key={dimension.id}
            dimension={dimension}
            status={status}
            drag={
              status === "mapped" && search === ""
                ? {
                    isDragging: dimension.id === dragId,
                    dropAt:
                      dragId != null && drop?.id === dimension.id
                        ? drop.position
                        : null,
                    onStart: () => setDragId(dimension.id),
                    onOver: (position) =>
                      setDrop({ id: dimension.id, position }),
                    onDrop: () => {
                      if (dragId != null && drop != null) {
                        onChange(
                          moveDimension(
                            mapping,
                            mapped,
                            dragId,
                            drop.id,
                            drop.position,
                          ),
                        );
                      }
                      endDrag();
                    },
                    onEnd: endDrag,
                  }
                : undefined
            }
            isSelected={dimension.id === currentId}
            onSelect={() => select(dimension)}
            onEdit={() => edit(dimension.id)}
            onRemove={() => handleRemove(dimension)}
            onMap={() => onChange(mapDimension(mapping, dimension))}
          />
        ))}
      </Section>
    );
  };

  const showFields = isMath && isAll;
  const info = (
    <HoverCard position="bottom-end" withArrow>
      <HoverCard.Target>
        <Icon name="info" size={14} c="text-secondary" />
      </HoverCard.Target>
      <HoverCard.Dropdown>
        <Text maw={280} p="md">
          {isMath
            ? "What the whole metric can be filtered and broken out by. Each one reads a field from every measure, even across tables."
            : "What this metric can be filtered and broken out by."}
        </Text>
      </HoverCard.Dropdown>
    </HoverCard>
  );

  const statusOf = (dimension: MetricDimension): Status =>
    removed.includes(dimension)
      ? "removed"
      : incomplete.includes(dimension)
        ? "incomplete"
        : "mapped";
  const editing = [...chartable, ...incomplete].find(
    (dimension) => dimension.id === editingId,
  );
  if (editing && !model.isLoading) {
    return (
      <Box className={S.root} component="aside">
        <Box className={S.scroll}>
          <DimensionForm
            key={editing.id}
            dimension={editing}
            status={statusOf(editing)}
            pills={pills}
            onBack={() => setEditingId(null)}
            onRename={(name) =>
              onChange(renameDimension(mapping, editing.id, name))
            }
            onPick={(pillId, pillDimensionId) =>
              onChange(pickField(mapping, editing, pillId, pillDimensionId))
            }
            onRemove={() => handleRemove(editing)}
            onMap={() => onChange(mapDimension(mapping, editing))}
          />
        </Box>
      </Box>
    );
  }

  return (
    <Box className={S.root} component="aside">
      {isAll ? (
        <Group gap="xs" wrap="nowrap" pb="md">
          <ActionIcon
            variant="subtle"
            c="text-secondary"
            aria-label="Back"
            onClick={() => setIsAll(false)}
          >
            <Icon name="chevronleft" />
          </ActionIcon>
          <Title order={4}>All fields</Title>
        </Group>
      ) : (
        showSearch && (
          <TextInput
            mb="lg"
            leftSection={<Icon name="search" />}
            placeholder="Search dimensions…"
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
          />
        )
      )}
      <Box ref={setList} className={S.scroll}>
        {model.isLoading ? (
          <Flex justify="center" p="lg">
            <Loader size="sm" />
          </Flex>
        ) : (
          <Stack gap="lg">
            {!isAll && (
              <>
                {mapped.length === 0 ? (
                  <Section
                    title="Dimensions in this metric"
                    count={0}
                    action={info}
                  >
                    <Text className={S.empty}>
                      {isMath
                        ? "Nothing yet: the measures have no field in common."
                        : "No dimensions in this metric."}
                    </Text>
                  </Section>
                ) : (
                  section("Dimensions in this metric", "mapped", mapped, info)
                )}
                {section("Incomplete", "incomplete", incomplete)}
                {section("Dimensions not in this metric", "removed", removed)}
              </>
            )}
            {showFields &&
              pills.map((pill) => (
                <PillFields
                  key={pill.id}
                  pill={pill}
                  model={model}
                  onOpen={(dimension) => {
                    setIsAll(false);
                    setOpenId(dimension.id);
                  }}
                  onMap={(pillDimensionId) =>
                    handleAdd({ pillId: pill.id, pillDimensionId })
                  }
                />
              ))}
          </Stack>
        )}
      </Box>
      {isMath && !isAll && !model.isLoading && (
        <Flex justify="space-between" align="center" pt="md">
          <Button
            variant="subtle"
            leftSection={<Icon name="add" />}
            onClick={() => handleAdd()}
          >
            New dimension
          </Button>
          <Button
            variant="subtle"
            c="text-secondary"
            onClick={() => setIsAll(true)}
          >
            See all
          </Button>
        </Flex>
      )}
    </Box>
  );
}

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

function DimensionRow({
  dimension,
  status,
  isSelected,
  onSelect,
  onEdit,
  onRemove,
  onMap,
  drag,
}: {
  dimension: MetricDimension;
  status: Status;
  /** Dimensions of the metric are dragged into order. */
  drag?: {
    isDragging: boolean;
    dropAt: "before" | "after" | null;
    onStart: () => void;
    onOver: (position: "before" | "after") => void;
    onDrop: () => void;
    onEnd: () => void;
  };
  /** The chart is split by it. */
  isSelected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onRemove: () => void;
  onMap: () => void;
}) {
  const isOut = status === "removed";
  const addLabel = "Add back to metric";
  const removeLabel =
    status === "mapped" ? "Remove from metric" : "Discard this dimension";
  return (
    <Box
      className={cx(S.row, {
        [S.open]: isSelected,
        [S.available]: isOut,
        [S.incomplete]: status === "incomplete",
        [S.draggable]: drag != null,
        [S.dragging]: drag?.isDragging,
        [S.dropBefore]: drag?.dropAt === "before",
        [S.dropAfter]: drag?.dropAt === "after",
      })}
      draggable={drag != null}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        drag?.onStart();
      }}
      onDragOver={(event) => {
        if (drag == null) {
          return;
        }
        event.preventDefault();
        const { top, height } = event.currentTarget.getBoundingClientRect();
        drag.onOver(event.clientY < top + height / 2 ? "before" : "after");
      }}
      onDrop={(event) => {
        event.preventDefault();
        drag?.onDrop();
      }}
      onDragEnd={drag?.onEnd}
    >
      <Flex align="center" gap="xs" pos="relative">
        <UnstyledButton
          className={cx(S.rowButton, { [S.wide]: isOut })}
          onClick={onSelect}
        >
          <Icon name={dimension.icon} className={S.rowIcon} />
          <Text className={S.rowName} truncate>
            {dimension.name}
          </Text>
          {isSelected && !isOut && (
            <Badge
              variant="light"
              color="brand"
              flex="none"
              leftSection={<Icon name="arrow_split" size={12} />}
            >
              Breakout
            </Badge>
          )}
          {dimension.differs && (
            <Tooltip label="The measures read different columns for this">
              <Icon name="link" size={12} className={S.marker} />
            </Tooltip>
          )}
        </UnstyledButton>
        {/* Laid over the end of the bar, so it keeps its width. */}
        <Flex
          className={cx(S.rowActions, S.hoverActions)}
          align="center"
          gap="xs"
        >
          {isOut && (
            <Tooltip label={addLabel}>
              <ActionIcon
                variant="subtle"
                c="core-brand"
                size="sm"
                aria-label={addLabel}
                onClick={onMap}
              >
                <Icon name="add" size={16} />
              </ActionIcon>
            </Tooltip>
          )}
          <Tooltip label="Edit dimension">
            <ActionIcon
              variant="subtle"
              c="core-brand"
              size="sm"
              aria-label="Edit dimension"
              onClick={onEdit}
            >
              <Icon name="pencil" size={16} />
            </ActionIcon>
          </Tooltip>
          {!isOut && (
            <Tooltip label={removeLabel}>
              <ActionIcon
                variant="subtle"
                c="core-brand"
                size="sm"
                aria-label={removeLabel}
                onClick={onRemove}
              >
                <Icon name="trash" size={16} />
              </ActionIcon>
            </Tooltip>
          )}
          {drag && <Icon name="grabber" size={16} className={S.grabber} />}
        </Flex>
      </Flex>
    </Box>
  );
}

/** One dimension, in the whole panel: its name and the field each measure reads. */
function DimensionForm({
  dimension,
  status,
  pills,
  onBack,
  onRename,
  onPick,
  onRemove,
  onMap,
}: {
  dimension: MetricDimension;
  status: Status;
  pills: PanelPill[];
  onBack: () => void;
  onRename: (name: string) => void;
  onPick: (pillId: string, pillDimensionId: string) => void;
  onRemove: () => void;
  onMap: () => void;
}) {
  const [name, setName] = useState(dimension.name);
  const commitName = () => {
    const trimmed = name.trim();
    if (trimmed !== "" && trimmed !== dimension.name) {
      onRename(trimmed);
    } else {
      setName(dimension.name);
    }
  };
  const overlap = valueOverlap(dimension);
  const hasFewInCommon = overlap != null && overlap.common * 2 < overlap.total;
  // Once one measure has a field, the others take the same kind of field.
  const kindFor = (pillId: string) =>
    pills.flatMap((pill) =>
      pill.id === pillId ? [] : (dimension.picks[pill.id]?.type ?? []),
    )[0];
  const isOut = status === "removed";
  const removeLabel =
    status === "mapped" ? "Remove from metric" : "Discard this dimension";

  return (
    <Stack gap="lg">
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
          {dimension.name}
        </Title>
      </Group>
      <TextInput
        label="Display name"
        value={name}
        onChange={(event) => setName(event.currentTarget.value)}
        onBlur={commitName}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            commitName();
          }
        }}
      />
      <Input.Wrapper label={pills.length > 1 ? "Columns" : "Column"}>
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
                value: dimension.picks[pill.id]?.id ?? null,
                options: pill.dimensions
                  .filter(
                    (option) =>
                      kindFor(pill.id) == null ||
                      option.type === kindFor(pill.id),
                  )
                  .map((option) => ({
                    value: option.id,
                    label: optionLabel(option),
                    icon: option.icon,
                  })),
              }}
              onChange={(id) => onPick(pill.id, id)}
            />
          ))}
        </Stack>
      </Input.Wrapper>
      {status === "incomplete" && (
        <Text className={S.note}>
          {`No chart yet: ${dimension.missing.join(" and ")} ${
            dimension.missing.length > 1 ? "have" : "has"
          } no field for it.`}
        </Text>
      )}
      {hasFewInCommon && (
        <Flex gap="xs" align="flex-start" className={S.warning}>
          <Icon name="warning" size={12} />
          <Text fz="sm" c="inherit">
            {`${overlap.common} of ${overlap.total} values in common. Check these are the same thing.`}
          </Text>
        </Flex>
      )}
      <Group justify="flex-start">
        {isOut ? (
          <Button leftSection={<Icon name="add" />} onClick={onMap}>
            Add back to metric
          </Button>
        ) : (
          <Button
            variant="subtle"
            c="text-secondary"
            leftSection={<Icon name="trash" />}
            onClick={onRemove}
          >
            {removeLabel}
          </Button>
        )}
      </Group>
    </Stack>
  );
}

/** Every field of one pill, in or out of the metric. */
function PillFields({
  pill,
  model,
  onOpen,
  onMap,
}: {
  pill: PanelPill;
  model: PanelModel;
  onOpen: (dimension: MetricDimension) => void;
  onMap: (pillDimensionId: string) => void;
}) {
  const [noteId, setNoteId] = useState<string | null>(null);
  const fields = pill.dimensions;
  if (fields.length === 0) {
    return null;
  }
  const handleClick = (field: PillDimension) => {
    const dimension = model.mapped.find(
      (mapped) => mapped.picks[pill.id]?.id === field.id,
    );
    if (dimension) {
      onOpen(dimension);
    } else {
      setNoteId(field.id === noteId ? null : field.id);
    }
  };
  return (
    <Section title={pill.name} count={fields.length}>
      {fields.map((field) => (
        <Box
          key={field.id}
          className={cx(S.row, { [S.open]: field.id === noteId })}
        >
          <UnstyledButton
            className={S.rowButton}
            onClick={() => handleClick(field)}
          >
            <Icon name={field.icon} className={S.rowIcon} />
            <Text className={S.rowName} truncate>
              {field.name}
            </Text>
            {isUsed(model, pill, field) && (
              <Tooltip label="In this metric">
                <Icon name="check" size={12} className={S.marker} />
              </Tooltip>
            )}
          </UnstyledButton>
          {field.id === noteId && (
            <Stack gap="sm" className={S.details}>
              <Text className={S.note}>
                {`No dimension of the metric reads this, so the chart can’t be split by it. Filter ${pill.name} by it in the formula, or map it to a field of the other measures.`}
              </Text>
              <Flex justify="flex-end">
                <Button
                  variant="filled"
                  size="compact-sm"
                  onClick={() => onMap(field.id)}
                >
                  Map to…
                </Button>
              </Flex>
            </Stack>
          )}
        </Box>
      ))}
    </Section>
  );
}
