/* eslint-disable boundaries/element-types -- throwaway prototype: drives the Metric Explorer's chart. */
import cx from "classnames";
import { useEffect, useRef, useState } from "react";

import { skipToken, useGetFieldQuery } from "metabase/api";
import { useMetricsViewerContext } from "metabase/metrics-viewer/context";
import { getDimensionBreakoutConfig } from "metabase/metrics-viewer/utils";
import {
  ActionIcon,
  Box,
  Button,
  Flex,
  Icon,
  Loader,
  Select,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";

import S from "./DimensionsPanel.module.css";
import {
  type Field,
  type MetricDimension,
  type PanelMapping,
  type PanelModel,
  type PanelPill,
  type PillDimension,
  addDimension,
  isUsed,
  mapDimension,
  pickField,
  removeDimension,
  renameDimension,
  valueOverlap,
} from "./panelModel";

const SUGGESTION_LIMIT = 5;

type Status = "mapped" | "suggested" | "removed" | "incomplete";

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
  const [openId, setOpenIdOnly] = useState<string | null>(null);
  // The selected dimension stays the chart's when its row is folded away.
  // Folded until its name is clicked: a dimension picked for the author, like
  // Time at the start, only marks what the chart shows.
  const [isExpanded, setIsExpanded] = useState(false);
  const setOpenId = (id: string | null, expand = true) => {
    setOpenIdOnly(id);
    setIsExpanded(expand);
  };
  const [isAll, setIsAll] = useState(false);
  const [showAllSuggested, setShowAllSuggested] = useState(false);

  const { pills, mapped, suggested, removed, incomplete } = model;
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
  const chartable = [...mapped, ...suggested, ...removed];
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
      setOpenId(fallbackId, false);
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

  /** A click on a name charts by it, and folds the fields away if they show. */
  const select = (dimension: MetricDimension) => setOpenId(dimension.id, false);
  /** The chevron shows which field each measure reads; most need no look. */
  const toggleDetails = (dimension: MetricDimension) =>
    dimension.id === currentId
      ? setIsExpanded((value) => !value)
      : setOpenId(dimension.id);

  const handleRemove = (dimension: MetricDimension) => {
    onChange(removeDimension(mapping, dimension));
    if (dimension.id === currentId) {
      const fallback =
        mapped.find(
          (other) => other.origin === "time" && other !== dimension,
        ) ?? mapped.find((other) => other !== dimension);
      setOpenId(fallback?.id ?? null, false);
    }
  };

  const handleAdd = (seed?: { pillId: string; pillDimensionId: string }) => {
    const next = addDimension(mapping, seed);
    onChange(next.mapping);
    setOpenId(next.id);
    setIsAll(false);
  };

  const section = (
    title: string | null,
    status: Status,
    shown: MetricDimension[],
  ) => {
    const isCapped = status === "suggested" && !showAllSuggested;
    const visible = isCapped ? shown.slice(0, SUGGESTION_LIMIT) : shown;
    if (shown.length === 0) {
      return null;
    }
    return (
      <Box>
        {title && <Text className={S.sectionTitle}>{title}</Text>}
        {visible.map((dimension) => (
          <DimensionRow
            key={dimension.id}
            dimension={dimension}
            status={status}
            pills={pills}
            isSelected={dimension.id === currentId}
            isOpen={dimension.id === currentId && isExpanded}
            onSelect={() => select(dimension)}
            onToggleDetails={() => toggleDetails(dimension)}
            onRemove={() => handleRemove(dimension)}
            onMap={() => onChange(mapDimension(mapping, dimension))}
            onRename={(name) =>
              onChange(renameDimension(mapping, dimension.id, name))
            }
            onPick={(pillId, pillDimensionId) =>
              onChange(pickField(mapping, dimension, pillId, pillDimensionId))
            }
          />
        ))}
        {visible.length < shown.length && (
          <UnstyledButton
            className={S.more}
            onClick={() => setShowAllSuggested(true)}
          >
            {`${shown.length - visible.length} more`}
          </UnstyledButton>
        )}
      </Box>
    );
  };

  const showFields = isMath && isAll;
  // With one measure there is nothing to match: they are just its dimensions.
  const title = isMath ? "Matched dimensions" : "Dimensions";

  return (
    <Box className={S.root} component="aside">
      <Flex align="center" justify="space-between" pb="md">
        <Flex align="center" gap="sm" miw={0}>
          {isAll && (
            <ActionIcon
              variant="subtle"
              c="text-secondary"
              aria-label="Back"
              onClick={() => setIsAll(false)}
            >
              <Icon name="chevronleft" />
            </ActionIcon>
          )}
          <Text fw={700} fz="lg">
            {isAll ? "All fields" : title}
          </Text>
        </Flex>
      </Flex>
      <Box className={S.scroll}>
        {model.isLoading ? (
          <Flex justify="center" p="lg">
            <Loader size="sm" />
          </Flex>
        ) : (
          <Stack gap="md">
            {!isAll && (
              <>
                {section(null, "mapped", mapped)}
                {mapped.length === 0 && (
                  <Text className={S.empty}>
                    {isMath
                      ? "Nothing yet: the measures have no field in common."
                      : "No dimensions in this metric."}
                  </Text>
                )}
                {section("Suggested", "suggested", suggested)}
                {section("Incomplete", "incomplete", incomplete)}
                {section("Removed", "removed", removed)}
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
                    setOpenId(dimension.id, false);
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
        <Flex className={S.footer} justify="space-between" align="center">
          <UnstyledButton
            className={S.footerButton}
            onClick={() => handleAdd()}
          >
            <Icon name="add" size={12} />
            Add dimension
          </UnstyledButton>
          <UnstyledButton
            className={S.footerButton}
            onClick={() => setIsAll(true)}
          >
            See all
          </UnstyledButton>
        </Flex>
      )}
    </Box>
  );
}

function DimensionRow({
  dimension,
  status,
  pills,
  isSelected,
  isOpen,
  onSelect,
  onToggleDetails,
  onRemove,
  onMap,
  onRename,
  onPick,
}: {
  dimension: MetricDimension;
  status: Status;
  pills: PanelPill[];
  /** The chart is split by it. */
  isSelected: boolean;
  /** Its fields show under its name. */
  isOpen: boolean;
  onSelect: () => void;
  onToggleDetails: () => void;
  onRemove: () => void;
  onMap: () => void;
  onRename: (name: string) => void;
  onPick: (pillId: string, pillDimensionId: string) => void;
}) {
  const isMath = pills.length > 1;
  const overlap = valueOverlap(dimension);
  const hasFewInCommon = overlap != null && overlap.common * 2 < overlap.total;
  // Once one measure has a field, the others take the same kind of field.
  const kindFor = (pillId: string) =>
    pills.flatMap((pill) =>
      pill.id === pillId ? [] : (dimension.picks[pill.id]?.type ?? []),
    )[0];
  // A row opened from elsewhere, like a new dimension, may be out of sight.
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (isOpen) {
      root.current?.scrollIntoView({ block: "nearest" });
    }
  }, [isOpen]);

  const removeLabel =
    status === "mapped" ? "Remove from metric" : "Discard this dimension";
  const detailsLabel = isOpen ? "Hide fields" : "Show fields";
  const addLabel =
    status === "suggested" ? "Add to metric" : "Add back to metric";
  const isOut = status === "suggested" || status === "removed";
  // One measure has no fields to match, so nothing to fold out.
  const hasDetails = isMath;
  const showTools = hasDetails ? isOpen : isSelected;

  // Renamed in place: the name turns into an input until Enter or Escape.
  const [isRenaming, setIsRenaming] = useState(false);
  const isCancelled = useRef(false);
  const finishRename = (value: string) => {
    const name = value.trim();
    if (!isCancelled.current && name !== "" && name !== dimension.name) {
      onRename(name);
    }
    isCancelled.current = false;
    setIsRenaming(false);
  };

  return (
    <Box ref={root} className={cx(S.row, { [S.open]: isSelected })}>
      <Flex align="center" gap="xs" pos="relative">
        {isRenaming ? (
          <Box className={cx(S.rowButton, S.renaming)}>
            <Icon name={dimension.icon} className={S.rowIcon} />
            <input
              className={S.rename}
              aria-label="Name"
              autoFocus
              defaultValue={dimension.name}
              onFocus={(event) => event.target.select()}
              onBlur={(event) => finishRename(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === "Escape") {
                  isCancelled.current = event.key === "Escape";
                  event.currentTarget.blur();
                }
              }}
            />
          </Box>
        ) : (
          <UnstyledButton
            className={cx(S.rowButton, {
              [S.wide]: isOut,
              [S.tools]: showTools,
            })}
            onClick={onSelect}
          >
            <Icon name={dimension.icon} className={S.rowIcon} />
            <Text className={S.rowName} truncate>
              {dimension.name}
            </Text>
            {dimension.differs && (
              <Tooltip label="The measures read different columns for this">
                <Icon name="link" size={12} className={S.marker} />
              </Tooltip>
            )}
          </UnstyledButton>
        )}
        {/* Laid over the end of the bar, so it keeps its width. */}
        {!isRenaming && (
          <Flex className={S.rowActions} align="center">
            {isOut && (
              <Tooltip label={addLabel}>
                <ActionIcon
                  variant="subtle"
                  c="text-secondary"
                  aria-label={addLabel}
                  onClick={onMap}
                >
                  <Icon name="add" />
                </ActionIcon>
              </Tooltip>
            )}
            {showTools && (
              <Tooltip label="Rename">
                <ActionIcon
                  variant="subtle"
                  c="text-secondary"
                  aria-label="Rename"
                  onClick={() => setIsRenaming(true)}
                >
                  <Icon name="pencil" />
                </ActionIcon>
              </Tooltip>
            )}
            {showTools && !isOut && (
              <Tooltip label={removeLabel}>
                <ActionIcon
                  variant="subtle"
                  c="text-secondary"
                  aria-label={removeLabel}
                  onClick={onRemove}
                >
                  <Icon name="trash" />
                </ActionIcon>
              </Tooltip>
            )}
            {hasDetails && (
              <Tooltip label={detailsLabel}>
                <ActionIcon
                  className={S.rowChevron}
                  variant="subtle"
                  c="text-secondary"
                  aria-label={detailsLabel}
                  aria-expanded={isOpen}
                  onClick={onToggleDetails}
                >
                  <Icon name={isOpen ? "chevronup" : "chevrondown"} />
                </ActionIcon>
              </Tooltip>
            )}
          </Flex>
        )}
      </Flex>
      {isOpen && hasDetails && (
        <Stack gap="sm" className={S.details}>
          {isMath &&
            pills.map((pill) => (
              <Select
                key={pill.id}
                label={
                  <Flex component="span" align="center" gap="xs">
                    {pill.name}
                    {dimension.picks[pill.id] && (
                      <FieldSource
                        fields={Object.values(dimension.picks[pill.id].targets)}
                      />
                    )}
                  </Flex>
                }
                size="sm"
                searchable
                placeholder="Pick a field"
                nothingFoundMessage="No fields found"
                value={dimension.picks[pill.id]?.id ?? null}
                data={pill.dimensions
                  .filter(
                    (option) =>
                      kindFor(pill.id) == null ||
                      option.type === kindFor(pill.id),
                  )
                  .map((option) => ({ value: option.id, label: option.name }))}
                onChange={(value) => {
                  if (value) {
                    onPick(pill.id, value);
                  }
                }}
              />
            ))}
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
        </Stack>
      )}
    </Box>
  );
}

/**
 * A small table icon: hovering it says where the measure's field lives, as
 * database, table and column. A metric that is math over measures has one
 * line per measure.
 */
function FieldSource({ fields }: { fields: Field[] }) {
  return (
    <Tooltip
      label={
        <Stack gap={4}>
          {fields.map((field) => (
            <FieldSourceLine
              key={`${field.sourceId}/${field.id}`}
              field={field}
            />
          ))}
        </Stack>
      }
    >
      <Box
        component="span"
        className={S.source}
        aria-label="Where this field is"
      >
        <Icon name="table" size={12} />
      </Box>
    </Tooltip>
  );
}

/** Looked up when the tooltip opens, not for every field in the list. */
function FieldSourceLine({ field }: { field: Field }) {
  const { data, isLoading } = useGetFieldQuery(
    field.fieldId == null ? skipToken : { id: field.fieldId },
  );
  const via = field.group ? ` (through ${field.group})` : "";
  if (isLoading) {
    return (
      <Text fz="sm" c="inherit">
        Loading…
      </Text>
    );
  }
  const parts = [
    data?.table?.db?.name,
    data?.table?.display_name,
    data?.display_name ?? field.column,
  ].filter((part) => part != null);
  return (
    <Text fz="sm" c="inherit">
      {`${parts.join(" › ")}${via}`}
    </Text>
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
    <Box>
      <Text className={S.sectionTitle}>{pill.name}</Text>
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
    </Box>
  );
}
