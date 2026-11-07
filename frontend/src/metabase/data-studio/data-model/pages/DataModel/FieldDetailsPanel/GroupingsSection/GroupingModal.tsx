import { useState } from "react";
import { t } from "ttag";

import {
  skipToken,
  useGetFieldValuesQuery,
  useGetTableQueryMetadataQuery,
} from "metabase/api";
import {
  ELAPSED_UNITS,
  type ElapsedUnit,
  type Grouping,
  type GroupingDefinition,
  type GroupingInferenceContext,
  TIME_EXTRACTS,
  TIME_UNITS,
  type TimeExtract,
  type TimeUnit,
  getElapsedUnitLabel,
  getGroupingKind,
  getTimeExtractLabel,
  getTimeUnitLabel,
  useResolvedGroupings,
} from "metabase/metadata/groupings";
import { isPartitionOnField } from "metabase/metadata/segment-groups";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import {
  ActionIcon,
  Button,
  Group,
  Icon,
  Input,
  Loader,
  Modal,
  NumberInput,
  Radio,
  ScrollArea,
  SegmentedControl,
  type SegmentedControlItem,
  Select,
  Stack,
  Text,
  TextInput,
} from "metabase/ui";
import { singularize } from "metabase/utils/formatting";
import {
  isDate,
  isDateWithoutTime,
  isFK,
  isPK,
} from "metabase-lib/v1/types/utils/isa";
import type { Field, FieldId, Segment, Table } from "metabase-types/api";

type TimeMode = "unit" | "extract" | "elapsed";

type TimeDraft = {
  mode: TimeMode;
  unit: TimeUnit;
  extract: TimeExtract;
  /** "now", or another date column's id */
  elapsedTo: string;
  elapsedUnit: ElapsedUnit;
};

type BinsMode = "count" | "quantile" | "edges";

type EdgeRow = { from: number | undefined; label: string };

type BinsDraft = {
  mode: BinsMode;
  count: number | undefined;
  quantileCount: number | undefined;
  edges: EdgeRow[];
};

type PartitionMode = "related" | "value-map" | "segment-group" | "process";

type PartitionDraft = {
  mode: PartitionMode;
  /** Each value's group label; blank puts it in Other */
  labels: Record<string, string>;
  segmentGroupId: string | null;
  processLevel: "order" | "buckets";
  /** A foreign key's grouping: a column of the table it points to */
  targetFieldId: FieldId | null;
  /** One of the target column's groupings; `null` is its values */
  targetGroupingName: string | null;
};

/** A foreign key to a table's column, like Account ID to Accounts */
const isRelatable = (field: Field) => isFK(field) && field.target != null;

interface GroupingModalProps {
  field: Field;
  table: Table;
  /** The grouping to edit; a new one when absent */
  grouping: Grouping | undefined;
  /** Names already used by this column's other groupings and built-ins */
  takenNames: string[];
  context: GroupingInferenceContext;
  onSave: (grouping: Grouping) => void;
  /** Removes the grouping being edited; absent for a new one */
  onRemove?: () => void;
  onClose: () => void;
}

/**
 * PROTOTYPE: mocked. Makes or edits an admin's grouping. Its kind follows the
 * column's type: time for dates, ranges for numbers, and groups of values for
 * the rest.
 */
export function GroupingModal({
  field,
  table,
  grouping,
  takenNames,
  context,
  onSave,
  onRemove,
  onClose,
}: GroupingModalProps) {
  const kind = getGroupingKind(field);
  const [name, setName] = useState(grouping?.name ?? "");
  const [timeDraft, setTimeDraft] = useState(() => getTimeDraft(grouping));
  const [binsDraft, setBinsDraft] = useState(() =>
    getBinsDraft(field, grouping),
  );
  const [partitionDraft, setPartitionDraft] = useState(() =>
    getPartitionDraft(field, grouping),
  );
  const { data: fieldValues, isLoading: isLoadingValues } =
    useGetFieldValuesQuery(
      kind === "partition" ? getRawTableFieldId(field) : skipToken,
    );
  const values = (fieldValues?.values ?? [])
    .map(([value]) => value)
    .filter((value) => value != null && value !== "")
    .map(String);

  const trimmedName = name.trim();
  const isNameTaken = takenNames.some(
    (taken) => taken.toLowerCase() === trimmedName.toLowerCase(),
  );
  const definition =
    kind === "time"
      ? buildTimeGrouping(timeDraft)
      : kind === "bins"
        ? buildBinsGrouping(binsDraft)
        : buildPartitionGrouping(partitionDraft, values);
  const canSave = trimmedName !== "" && !isNameTaken && definition != null;

  const handleSave = () => {
    if (trimmedName !== "" && !isNameTaken && definition != null) {
      onSave({ name: trimmedName, source: "admin", ...definition });
    }
  };

  return (
    <Modal
      opened
      size="lg"
      title={grouping ? t`Edit grouping` : t`New grouping`}
      onClose={onClose}
    >
      <Stack gap="xl">
        <TextInput
          label={t`Name`}
          description={t`People see this name in Group by.`}
          value={name}
          required
          autoFocus
          error={
            isNameTaken
              ? t`This column already has a grouping with this name.`
              : undefined
          }
          onChange={(event) => setName(event.target.value)}
        />
        {kind === "time" && (
          <TimeEditor
            field={field}
            fields={table.fields ?? []}
            draft={timeDraft}
            onChange={setTimeDraft}
          />
        )}
        {kind === "bins" && (
          <BinsEditor draft={binsDraft} onChange={setBinsDraft} />
        )}
        {kind === "partition" && (
          <PartitionEditor
            field={field}
            segments={table.segments ?? []}
            context={context}
            values={values}
            isLoadingValues={isLoadingValues}
            draft={partitionDraft}
            onChange={setPartitionDraft}
            onSuggestName={(suggestion) =>
              setName((current) =>
                current.trim() === "" ? suggestion : current,
              )
            }
          />
        )}
      </Stack>
      <Modal.Footer>
        {onRemove && (
          // Pushed to the left, away from Save
          <Button
            variant="subtle"
            color="negative"
            mr="auto"
            onClick={onRemove}
          >
            {t`Remove this group`}
          </Button>
        )}
        <Button onClick={onClose}>{t`Cancel`}</Button>
        <Button variant="filled" disabled={!canSave} onClick={handleSave}>
          {t`Save`}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

function getTimeDraft(grouping: Grouping | undefined): TimeDraft {
  const draft: TimeDraft = {
    mode: "unit",
    unit: "month",
    extract: "day-of-week",
    elapsedTo: "now",
    elapsedUnit: "day",
  };
  if (grouping?.kind !== "time") {
    return draft;
  }
  const definition = grouping.definition;
  switch (definition.type) {
    case "unit":
      return { ...draft, mode: "unit", unit: definition.unit };
    case "extract":
      return { ...draft, mode: "extract", extract: definition.extract };
    case "elapsed":
      return {
        ...draft,
        mode: "elapsed",
        elapsedTo: String(definition.to),
        elapsedUnit: definition.unit,
      };
  }
}

function getBinsDraft(field: Field, grouping: Grouping | undefined): BinsDraft {
  // Seed custom ranges at the quartile breaks sync profiled, if any
  const profile = field.fingerprint?.type?.["type/Number"];
  const seeded = [profile?.min, profile?.q1, profile?.q3]
    .filter((value): value is number => value != null)
    .map((value) => Math.round(value * 100) / 100);
  const isSeedUsable =
    seeded.length === 3 && seeded[0] < seeded[1] && seeded[1] < seeded[2];
  const draft: BinsDraft = {
    mode: "count",
    count: 10,
    quantileCount: 4,
    edges: (isSeedUsable ? seeded : [0]).map((from) => ({ from, label: "" })),
  };
  if (grouping?.kind !== "bins") {
    return draft;
  }
  const definition = grouping.definition;
  switch (definition.type) {
    case "auto":
      return draft;
    case "count":
      return { ...draft, mode: "count", count: definition.count };
    case "quantile":
      return { ...draft, mode: "quantile", quantileCount: definition.count };
    case "edges":
      return {
        ...draft,
        mode: "edges",
        edges: definition.edges.map((from, index) => ({
          from,
          label: definition.labels[index] ?? "",
        })),
      };
  }
}

function getPartitionDraft(
  field: Field,
  grouping: Grouping | undefined,
): PartitionDraft {
  const draft: PartitionDraft = {
    // A foreign key's new grouping most likely reads the table it points to
    mode: isRelatable(field) ? "related" : "value-map",
    labels: {},
    segmentGroupId: null,
    processLevel: "order",
    targetFieldId: null,
    targetGroupingName: null,
  };
  if (grouping?.kind === "related") {
    return {
      ...draft,
      mode: "related",
      targetFieldId: grouping.definition.targetFieldId,
      targetGroupingName: grouping.definition.groupingName,
    };
  }
  if (grouping?.kind !== "partition") {
    return draft;
  }
  const definition = grouping.definition;
  switch (definition.type) {
    case "process":
      return { ...draft, mode: "process", processLevel: definition.level };
    case "segment-group":
      return {
        ...draft,
        mode: "segment-group",
        segmentGroupId: definition.segmentGroupId,
      };
    case "value-map":
      return {
        ...draft,
        mode: "value-map",
        labels: Object.fromEntries(
          definition.groups.flatMap(({ label, values }) =>
            values.map((value) => [value, label]),
          ),
        ),
      };
  }
}

function buildTimeGrouping(draft: TimeDraft): GroupingDefinition {
  switch (draft.mode) {
    case "unit":
      return { kind: "time", definition: { type: "unit", unit: draft.unit } };
    case "extract":
      return {
        kind: "time",
        definition: { type: "extract", extract: draft.extract },
      };
    case "elapsed":
      return {
        kind: "time",
        definition: {
          type: "elapsed",
          to: draft.elapsedTo === "now" ? "now" : Number(draft.elapsedTo),
          unit: draft.elapsedUnit,
        },
      };
  }
}

/** A range's name when an admin leaves it blank: "10–20", or "20+" for the last */
const getRangeLabel = (from: number, to: number | undefined) =>
  to == null ? `${from}+` : `${from}–${to}`;

/** Rows with a start, in ascending order */
const getSortedEdges = (rows: EdgeRow[]) =>
  rows
    .flatMap(({ from, label }) => (from == null ? [] : [{ from, label }]))
    .sort((a, b) => a.from - b.from);

function buildBinsGrouping(draft: BinsDraft): GroupingDefinition | null {
  switch (draft.mode) {
    case "count":
      return draft.count != null && draft.count > 0
        ? { kind: "bins", definition: { type: "count", count: draft.count } }
        : null;
    case "quantile":
      return draft.quantileCount != null && draft.quantileCount > 1
        ? {
            kind: "bins",
            definition: { type: "quantile", count: draft.quantileCount },
          }
        : null;
    case "edges": {
      const edges = getSortedEdges(draft.edges);
      if (edges.length === 0) {
        return null;
      }
      return {
        kind: "bins",
        definition: {
          type: "edges",
          edges: edges.map(({ from }) => from),
          labels: edges.map(
            ({ from, label }, index) =>
              label.trim() || getRangeLabel(from, edges[index + 1]?.from),
          ),
        },
      };
    }
  }
}

function buildPartitionGrouping(
  draft: PartitionDraft,
  values: string[],
): GroupingDefinition | null {
  switch (draft.mode) {
    case "related":
      return draft.targetFieldId != null
        ? {
            kind: "related",
            definition: {
              targetFieldId: draft.targetFieldId,
              groupingName: draft.targetGroupingName,
            },
          }
        : null;
    case "process":
      return {
        kind: "partition",
        definition: { type: "process", level: draft.processLevel },
      };
    case "segment-group":
      return draft.segmentGroupId != null
        ? {
            kind: "partition",
            definition: {
              type: "segment-group",
              segmentGroupId: draft.segmentGroupId,
            },
          }
        : null;
    case "value-map": {
      // Values sharing a label form one group, in first-seen order; saved
      // values no longer cached keep their group
      const allValues = [
        ...values,
        ...Object.keys(draft.labels).filter((value) => !values.includes(value)),
      ];
      const groups: { label: string; values: string[] }[] = [];
      let other = false;
      allValues.forEach((value) => {
        const label = (draft.labels[value] ?? "").trim();
        if (label === "") {
          other = true;
          return;
        }
        const group = groups.find((known) => known.label === label);
        if (group) {
          group.values.push(value);
        } else {
          groups.push({ label, values: [value] });
        }
      });
      return groups.length > 0
        ? {
            kind: "partition",
            definition: { type: "value-map", groups, other },
          }
        : null;
    }
  }
}

function TimeEditor({
  field,
  fields,
  draft,
  onChange,
}: {
  field: Field;
  fields: Field[];
  draft: TimeDraft;
  onChange: (draft: TimeDraft) => void;
}) {
  const isDateOnly = isDateWithoutTime(field);
  const fieldId = getRawTableFieldId(field);
  const otherDates = fields.filter(
    (other) => isDate(other) && getRawTableFieldId(other) !== fieldId,
  );

  return (
    <Stack gap="xl">
      <ModeControl<TimeMode>
        label={t`Group dates by`}
        data={[
          { value: "unit", label: t`Period` },
          { value: "extract", label: t`Part of` },
          { value: "elapsed", label: t`Time since` },
        ]}
        descriptions={{
          unit: t`Rounds each date down to a period, like March 2024 or the week of March 4. Good for trends over time.`,
          extract: t`Takes one part of each date, like the day of the week or the month, whatever the year. Good for comparing cycles, like weekdays and weekends.`,
          elapsed: t`Counts the time from each date to now, or to another date column, like days since signup or days to close.`,
        }}
        value={draft.mode}
        onChange={(mode) => onChange({ ...draft, mode })}
      />
      {draft.mode === "unit" && (
        <Select<TimeUnit>
          label={t`Period`}
          data={TIME_UNITS.filter(
            (unit) => !isDateOnly || (unit !== "minute" && unit !== "hour"),
          ).map((unit) => ({ value: unit, label: getTimeUnitLabel(unit) }))}
          value={draft.unit}
          allowDeselect={false}
          onChange={(unit) => onChange({ ...draft, unit })}
        />
      )}
      {draft.mode === "extract" && (
        <Select<TimeExtract>
          label={t`Part of the date`}
          data={TIME_EXTRACTS.filter(
            (extract) => !isDateOnly || extract !== "hour-of-day",
          ).map((extract) => ({
            value: extract,
            label: getTimeExtractLabel(extract),
          }))}
          value={draft.extract}
          allowDeselect={false}
          onChange={(extract) => onChange({ ...draft, extract })}
        />
      )}
      {draft.mode === "elapsed" && (
        <Group grow align="flex-start">
          <Select
            label={t`Until`}
            data={[
              { value: "now", label: t`Now` },
              ...otherDates.map((other) => ({
                value: String(getRawTableFieldId(other)),
                label: other.display_name,
              })),
            ]}
            value={draft.elapsedTo}
            allowDeselect={false}
            onChange={(elapsedTo) => onChange({ ...draft, elapsedTo })}
          />
          <Select<ElapsedUnit>
            label={t`Counted in`}
            data={ELAPSED_UNITS.map((unit) => ({
              value: unit,
              label: getElapsedUnitLabel(unit),
            }))}
            value={draft.elapsedUnit}
            allowDeselect={false}
            onChange={(elapsedUnit) => onChange({ ...draft, elapsedUnit })}
          />
        </Group>
      )}
    </Stack>
  );
}

const toNumber = (value: number | string) =>
  typeof value === "number" ? value : undefined;

function BinsEditor({
  draft,
  onChange,
}: {
  draft: BinsDraft;
  onChange: (draft: BinsDraft) => void;
}) {
  const sortedEdges = getSortedEdges(draft.edges);
  const updateEdge = (index: number, change: Partial<EdgeRow>) =>
    onChange({
      ...draft,
      edges: draft.edges.map((row, i) =>
        i === index ? { ...row, ...change } : row,
      ),
    });

  return (
    <Stack gap="xl">
      <ModeControl<BinsMode>
        label={t`Group numbers into`}
        data={[
          { value: "count", label: t`Equal ranges` },
          { value: "quantile", label: t`Quantiles` },
          { value: "edges", label: t`Custom ranges` },
        ]}
        descriptions={{
          count: t`Splits the span from the lowest to the highest value into ranges of the same width. Some ranges may hold far more rows than others.`,
          quantile: t`Splits the rows into groups of about the same size, like quartiles. The ranges' widths vary to fit.`,
          edges: t`Your own ranges and names, like Small, Medium, and Large. Each range starts at its number and runs up to the next one.`,
        }}
        value={draft.mode}
        onChange={(mode) => onChange({ ...draft, mode })}
      />
      {draft.mode === "count" && (
        <NumberInput
          label={t`Number of ranges`}
          min={1}
          allowDecimal={false}
          value={draft.count ?? ""}
          onChange={(value) => onChange({ ...draft, count: toNumber(value) })}
        />
      )}
      {draft.mode === "quantile" && (
        <NumberInput
          label={t`Number of groups`}
          description={t`Each holds about the same number of rows. 4 makes quartiles.`}
          min={2}
          allowDecimal={false}
          value={draft.quantileCount ?? ""}
          onChange={(value) =>
            onChange({ ...draft, quantileCount: toNumber(value) })
          }
        />
      )}
      {draft.mode === "edges" && (
        <Stack gap="sm">
          <Text size="sm" c="text-secondary">
            {t`Each range starts at its number and runs to the next one. The last has no end.`}
          </Text>
          {draft.edges.map((row, index) => {
            const sortedIndex = sortedEdges.findIndex(
              (edge) => edge.from === row.from,
            );
            const autoLabel =
              row.from == null
                ? t`Label`
                : getRangeLabel(row.from, sortedEdges[sortedIndex + 1]?.from);
            return (
              <Group key={index} gap="sm" wrap="nowrap">
                <NumberInput
                  aria-label={t`From`}
                  placeholder={t`From`}
                  w={140}
                  value={row.from ?? ""}
                  onChange={(value) =>
                    updateEdge(index, { from: toNumber(value) })
                  }
                />
                <TextInput
                  aria-label={t`Label`}
                  placeholder={autoLabel}
                  flex={1}
                  value={row.label}
                  onChange={(event) =>
                    updateEdge(index, { label: event.target.value })
                  }
                />
                <ActionIcon
                  aria-label={t`Remove range`}
                  disabled={draft.edges.length === 1}
                  onClick={() =>
                    onChange({
                      ...draft,
                      edges: draft.edges.filter((_row, i) => i !== index),
                    })
                  }
                >
                  <Icon name="close" />
                </ActionIcon>
              </Group>
            );
          })}
          <Group>
            <Button
              variant="subtle"
              leftSection={<Icon name="add" />}
              onClick={() =>
                onChange({
                  ...draft,
                  edges: [...draft.edges, { from: undefined, label: "" }],
                })
              }
            >
              {t`Add range`}
            </Button>
          </Group>
        </Stack>
      )}
    </Stack>
  );
}

function PartitionEditor({
  field,
  segments,
  context,
  values,
  isLoadingValues,
  draft,
  onChange,
  onSuggestName,
}: {
  field: Field;
  segments: Segment[];
  context: GroupingInferenceContext;
  values: string[];
  isLoadingValues: boolean;
  draft: PartitionDraft;
  onChange: (draft: PartitionDraft) => void;
  onSuggestName: (name: string) => void;
}) {
  const fieldId = getRawTableFieldId(field);
  const isStatus =
    context.statusField != null &&
    getRawTableFieldId(context.statusField) === fieldId;
  // Only groups that split this column's values, not other columns'
  const partitions = context.segmentGroups.filter((group) =>
    isPartitionOnField(group, fieldId, segments),
  );
  const descriptions: Record<PartitionMode, string> = {
    related: t`Groups rows by a column of the table this key points to, like deals by their account's plan.`,
    "value-map": t`Name and pick a group for each value.`,
    "segment-group": t`Values are grouped into exclusive segments.`,
    process: t`Group values by status states, or by outcome buckets.`,
  };
  const modes: { value: PartitionMode; label: string }[] = [
    { value: "value-map", label: t`Custom named groups` },
    { value: "segment-group", label: t`Segment group` },
  ];
  if (isRelatable(field)) {
    modes.unshift({ value: "related", label: t`Related column` });
  }
  if (isStatus) {
    modes.push({ value: "process", label: t`Status order` });
  }

  return (
    <Stack gap="xl">
      {/* Every option's explanation shows at once, so the choice is informed */}
      <Radio.Group
        label={t`Group values by`}
        value={draft.mode}
        onChange={(value) => {
          const mode = modes.find((option) => option.value === value)?.value;
          if (!mode) {
            return;
          }
          // Start with the first group that fits, so Save works right away
          const isPicking =
            mode === "segment-group" &&
            !partitions.some(({ id }) => id === draft.segmentGroupId);
          onChange({
            ...draft,
            mode,
            segmentGroupId: isPicking
              ? (partitions[0]?.id ?? null)
              : draft.segmentGroupId,
          });
        }}
      >
        <Stack gap="md" mt="sm">
          {modes.map(({ value, label }) => (
            <Radio
              key={value}
              value={value}
              label={label}
              description={descriptions[value]}
            />
          ))}
        </Stack>
      </Radio.Group>
      {draft.mode === "related" && field.target != null && (
        <RelatedEditor
          targetTableId={field.target.table_id}
          draft={draft}
          onChange={onChange}
          onSuggestName={onSuggestName}
        />
      )}
      {draft.mode === "value-map" &&
        (isLoadingValues ? (
          <Loader size="sm" />
        ) : values.length === 0 ? (
          <Text c="text-secondary">
            {t`No cached values. Re-scan this column's values to group them.`}
          </Text>
        ) : (
          <Stack gap="sm">
            <ScrollArea.Autosize mah={320}>
              <Stack gap="xs">
                {values.map((value) => (
                  <Group key={value} gap="sm" wrap="nowrap">
                    <Text flex={1} truncate title={value}>
                      {value}
                    </Text>
                    <TextInput
                      aria-label={t`Group for ${value}`}
                      placeholder={t`Other`}
                      w={220}
                      value={draft.labels[value] ?? ""}
                      onChange={(event) =>
                        onChange({
                          ...draft,
                          labels: {
                            ...draft.labels,
                            [value]: event.target.value,
                          },
                        })
                      }
                    />
                  </Group>
                ))}
              </Stack>
            </ScrollArea.Autosize>
          </Stack>
        ))}
      {draft.mode === "segment-group" &&
        (partitions.length === 0 ? (
          <Text c="text-secondary">
            {t`There's no segment group to use yet. In the Segments tab, make one set to Partition, with segments that only filter on ${field.display_name}.`}
          </Text>
        ) : (
          <Select<string | null>
            label={t`Segment group`}
            description={t`Each segment in the group becomes one bucket. We only list groups with segments that exclusively filter on this column, without overlapping.`}
            data={partitions.map(({ id, name }) => ({
              value: id,
              label: name,
            }))}
            value={draft.segmentGroupId}
            placeholder={t`Pick a segment group`}
            allowDeselect={false}
            onChange={(segmentGroupId) =>
              onChange({ ...draft, segmentGroupId })
            }
          />
        ))}
      {draft.mode === "process" && (
        // Always exactly two levels, so a switch rather than a dropdown
        <ModeControl<PartitionDraft["processLevel"]>
          label={t`Groups`}
          data={[
            { value: "order", label: t`All states` },
            { value: "buckets", label: t`Outcome buckets` },
          ]}
          descriptions={{
            order: t`One group per status, in the order set in the Values tab.`,
            buckets: t`Statuses combined by outcome: Open, Won, Lost, and Cancelled.`,
          }}
          value={draft.processLevel}
          onChange={(processLevel) => onChange({ ...draft, processLevel })}
        />
      )}
    </Stack>
  );
}

// Picker values for "group by the column's own values"
const BY_VALUES = "__values__";

/** Picks a column of the table a foreign key points to, and how to group it */
function RelatedEditor({
  targetTableId,
  draft,
  onChange,
  onSuggestName,
}: {
  targetTableId: Table["id"];
  draft: PartitionDraft;
  onChange: (draft: PartitionDraft) => void;
  onSuggestName: (name: string) => void;
}) {
  const { data: targetTable, isLoading } = useGetTableQueryMetadataQuery({
    id: targetTableId,
  });
  if (isLoading || !targetTable) {
    return <Loader size="sm" />;
  }
  // Its key is what the foreign key already holds
  const columns = (targetTable.fields ?? []).filter((column) => !isPK(column));
  const targetField = columns.find(
    (column) => getRawTableFieldId(column) === draft.targetFieldId,
  );

  return (
    <Stack gap="xl">
      <Select<string | null>
        label={t`Column of ${targetTable.display_name}`}
        description={t`Rows group by this column of the row they point to.`}
        data={columns.map((column) => ({
          value: String(getRawTableFieldId(column)),
          label: column.display_name,
        }))}
        value={draft.targetFieldId != null ? String(draft.targetFieldId) : null}
        placeholder={t`Pick a column`}
        searchable
        allowDeselect={false}
        onChange={(value) => {
          const column = columns.find(
            (known) => String(getRawTableFieldId(known)) === value,
          );
          if (!column) {
            return;
          }
          onChange({
            ...draft,
            targetFieldId: getRawTableFieldId(column),
            targetGroupingName: null,
          });
          // "Account plan"
          onSuggestName(
            `${singularize(targetTable.display_name)} ${column.display_name.toLowerCase()}`,
          );
        }}
      />
      {targetField && (
        <TargetGroupingSelect
          targetField={targetField}
          targetTable={targetTable}
          value={draft.targetGroupingName}
          onChange={(targetGroupingName) =>
            onChange({ ...draft, targetGroupingName })
          }
        />
      )}
    </Stack>
  );
}

/** The target column's own values, or one of its groupings */
function TargetGroupingSelect({
  targetField,
  targetTable,
  value,
  onChange,
}: {
  targetField: Field;
  targetTable: Table;
  value: string | null;
  onChange: (groupingName: string | null) => void;
}) {
  const { groupings, builtIns } = useResolvedGroupings(
    targetField,
    targetTable,
  );
  const names = [...groupings, ...builtIns].map(({ name }) => name);
  return (
    <Select<string>
      label={t`Grouped by`}
      data={[
        { value: BY_VALUES, label: t`Its values` },
        ...names.map((name) => ({ value: name, label: name })),
      ]}
      value={value ?? BY_VALUES}
      allowDeselect={false}
      onChange={(next) => onChange(next === BY_VALUES ? null : next)}
    />
  );
}

/**
 * A choice of how to group, with a label saying what's being picked and,
 * under it, what the picked way does.
 */
function ModeControl<Mode extends string>({
  label,
  data,
  descriptions,
  value,
  onChange,
}: {
  label: string;
  data: SegmentedControlItem<Mode>[];
  descriptions: Record<Mode, string>;
  value: Mode;
  onChange: (value: Mode) => void;
}) {
  return (
    <Input.Wrapper
      label={label}
      description={descriptions[value]}
      // The explanation follows the choice it explains
      inputWrapperOrder={["label", "input", "description"]}
    >
      <SegmentedControl<Mode>
        fullWidth
        data={data}
        value={value}
        onChange={onChange}
        mt="xs"
        mb="xs"
      />
    </Input.Wrapper>
  );
}
