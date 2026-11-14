import { t } from "ttag";

import {
  DEFAULT_HIERARCHY_OPTIONS,
  HIERARCHY_TYPES,
  type Hierarchy,
  type HierarchyKind,
  type LeafDisplay,
  getHierarchyType,
  getHierarchyTypeDescription,
  getHierarchyTypeLabel,
  getLeafDisplay,
} from "metabase/metadata/hierarchies";
import {
  ActionIcon,
  Box,
  Button,
  Group,
  Icon,
  Radio,
  Stack,
  Switch,
  Text,
  Title,
} from "metabase/ui";
import type { Field, FieldId } from "metabase-types/api";

import {
  COLUMN_SELECT_MAX_WIDTH,
  type ColumnOption,
  ColumnSelect,
} from "./ColumnSelect";
import { INDENT_WIDTH } from "./constants";
import { type LevelColumn, getLevelValue } from "./use-level-columns";

/** Everything about a hierarchy but its name and id, as the form edits it */
export type HierarchyDraft = {
  kind: HierarchyKind;
  /** A level's column per row, top first; `null` until one is picked */
  levelValues: (string | null)[];
  parentKeyFieldId?: FieldId;
  depthFieldId?: FieldId;
  pathFieldId?: FieldId;
  defaultLevelFieldId?: FieldId;
  leafDisplay: LeafDisplay;
  offerDrill: boolean;
  offerTreeFilter: boolean;
  hideLevelColumns: boolean;
};

export function getHierarchyDraft(
  hierarchy?: Hierarchy | null,
): HierarchyDraft {
  return {
    kind: hierarchy?.kind ?? "fixed",
    // A new hierarchy starts with two empty levels to fill in
    levelValues:
      hierarchy && hierarchy.levels.length > 0
        ? hierarchy.levels.map(getLevelValue)
        : [null, null],
    parentKeyFieldId: hierarchy?.parentKeyFieldId,
    depthFieldId: hierarchy?.depthFieldId,
    pathFieldId: hierarchy?.pathFieldId,
    defaultLevelFieldId: hierarchy?.defaultLevelFieldId,
    leafDisplay:
      hierarchy?.leafDisplay ?? DEFAULT_HIERARCHY_OPTIONS.leafDisplay,
    offerDrill: hierarchy?.offerDrill ?? DEFAULT_HIERARCHY_OPTIONS.offerDrill,
    offerTreeFilter:
      hierarchy?.offerTreeFilter ?? DEFAULT_HIERARCHY_OPTIONS.offerTreeFilter,
    hideLevelColumns:
      hierarchy?.hideLevelColumns ?? DEFAULT_HIERARCHY_OPTIONS.hideLevelColumns,
  };
}

const getPickedColumns = (draft: HierarchyDraft, columns: LevelColumn[]) =>
  draft.levelValues.flatMap((value) => {
    const column = columns.find((known) => known.value === value);
    return column ? [column] : [];
  });

/** A recursive hierarchy needs its parent key; the others two levels */
export const isHierarchyDraftComplete = (
  draft: HierarchyDraft,
  columns: LevelColumn[],
) =>
  draft.kind === "recursive"
    ? draft.parentKeyFieldId != null
    : getPickedColumns(draft, columns).length >= 2;

export function toHierarchy(
  draft: HierarchyDraft,
  { id, name, columns }: { id: string; name: string; columns: LevelColumn[] },
): Hierarchy {
  const isRecursive = draft.kind === "recursive";
  const levels = isRecursive
    ? []
    : getPickedColumns(draft, columns).map(({ level }) => level);
  return {
    id,
    name,
    kind: draft.kind,
    levels,
    parentKeyFieldId: isRecursive ? draft.parentKeyFieldId : undefined,
    depthFieldId: isRecursive ? draft.depthFieldId : undefined,
    pathFieldId: isRecursive ? draft.pathFieldId : undefined,
    defaultLevelFieldId: levels.some(
      ({ fieldId }) => fieldId === draft.defaultLevelFieldId,
    )
      ? draft.defaultLevelFieldId
      : undefined,
    leafDisplay: getLeafDisplay(draft.kind, draft.leafDisplay),
    offerDrill: draft.offerDrill,
    offerTreeFilter: draft.offerTreeFilter,
    hideLevelColumns: !isRecursive && draft.hideLevelColumns,
    // An admin's edit makes it theirs, so sync leaves it alone
    source: "admin",
  };
}

/** The type, then the levels or the parent key */
export function HierarchyDefinitionFields({
  draft,
  fields,
  columns,
  onChange,
}: {
  draft: HierarchyDraft;
  fields: Field[];
  columns: LevelColumn[];
  onChange: (draft: HierarchyDraft) => void;
}) {
  const update = (patch: Partial<HierarchyDraft>) =>
    onChange({ ...draft, ...patch });
  const isRecursive = draft.kind === "recursive";
  // A parent key, depth or path is one of the table's own columns
  const ownOptions = columns
    .filter(({ level }) => level.viaFieldId == null)
    .map(({ value, label, icon }): ColumnOption => ({ value, label, icon }));
  const toFieldId = (value: string | null): FieldId | undefined =>
    fields.find((field) => String(field.id) === value)?.id;

  return (
    <>
      <Radio.Group
        label={t`Type of hierarchy`}
        value={getHierarchyType(draft.kind)}
        onChange={(value) => {
          if (value === "parent") {
            update({ kind: "recursive" });
          } else if (value === "levels" && draft.kind === "recursive") {
            // Gaps show until someone picks skipping them in Options
            update({ kind: "fixed" });
          }
        }}
      >
        <Stack gap="md" mt="sm">
          {HIERARCHY_TYPES.map((option) => (
            <Radio
              key={option}
              value={option}
              label={getHierarchyTypeLabel(option)}
              description={getHierarchyTypeDescription(option)}
            />
          ))}
        </Stack>
      </Radio.Group>

      {isRecursive ? (
        <Stack gap="xl">
          <ColumnSelect
            label={t`Parent key`}
            description={t`The column that points to each row's parent row.`}
            placeholder={t`Pick a column`}
            options={ownOptions}
            value={
              draft.parentKeyFieldId != null
                ? String(draft.parentKeyFieldId)
                : null
            }
            searchable
            onChange={(value) => update({ parentKeyFieldId: toFieldId(value) })}
          />
          <ColumnSelect
            label={t`Depth column`}
            description={t`How deep each row is in the tree.`}
            placeholder={t`Optional`}
            options={ownOptions}
            value={
              draft.depthFieldId != null ? String(draft.depthFieldId) : null
            }
            searchable
            clearable
            onChange={(value) => update({ depthFieldId: toFieldId(value) })}
          />
          <ColumnSelect
            label={t`Path column`}
            description={t`Each row's path from the top, like /a/b/c.`}
            placeholder={t`Optional`}
            options={ownOptions}
            value={draft.pathFieldId != null ? String(draft.pathFieldId) : null}
            searchable
            clearable
            onChange={(value) => update({ pathFieldId: toFieldId(value) })}
          />
        </Stack>
      ) : (
        <LevelsEditor
          values={draft.levelValues}
          columns={columns}
          onChange={(levelValues) => update({ levelValues })}
        />
      )}
    </>
  );
}

/** How the hierarchy shows up: where it starts, leaves, drill and filters */
export function HierarchyOptionsFields({
  draft,
  columns,
  onChange,
}: {
  draft: HierarchyDraft;
  columns: LevelColumn[];
  onChange: (draft: HierarchyDraft) => void;
}) {
  const update = (patch: Partial<HierarchyDraft>) =>
    onChange({ ...draft, ...patch });
  const isRecursive = draft.kind === "recursive";
  const pickedColumns = getPickedColumns(draft, columns);
  // Unset means the top level, which follows the levels' order
  const startFieldId =
    draft.defaultLevelFieldId ?? pickedColumns[0]?.level.fieldId;

  return (
    <Stack gap="lg">
      <Title order={4}>{t`Options`}</Title>
      <Stack gap="xl">
        {!isRecursive && (
          <ColumnSelect
            label={t`Level to start at`}
            description={t`Questions and X-rays will start here.`}
            placeholder={t`Pick levels first`}
            options={pickedColumns.map(({ level, label, icon }) => ({
              value: String(level.fieldId),
              label,
              icon,
            }))}
            value={startFieldId != null ? String(startFieldId) : null}
            allowDeselect={false}
            onChange={(value) => {
              const fieldId = pickedColumns.find(
                ({ level }) => String(level.fieldId) === value,
              )?.level.fieldId;
              update({
                // Picking the top level goes back to following it
                defaultLevelFieldId:
                  fieldId === pickedColumns[0]?.level.fieldId
                    ? undefined
                    : fieldId,
              });
            }}
          />
        )}
        {!isRecursive && (
          // Fixed shows a gap as "(None)"; ragged skips over it. A member with
          // no child is a gap at the bottom, so this decides that case too.
          <Radio.Group
            label={t`What to do when a row is missing a level`}
            description={t`Applies to drill-down, expandable tables and dashboard filters.`}
            value={draft.kind}
            onChange={(value) =>
              update({ kind: value === "ragged" ? "ragged" : "fixed" })
            }
          >
            <Stack gap="sm" mt="sm">
              <Radio value="ragged" label={t`Skip the missing level`} />
              <Radio
                value="fixed"
                label={t`Show "(None)" in place of the missing level`}
              />
            </Stack>
          </Radio.Group>
        )}
        {isRecursive && (
          <Radio.Group
            label={t`In tables, what should happen when a parent row has no child?`}
            value={draft.leafDisplay}
            onChange={(value) =>
              update({
                leafDisplay: value === "empty_child" ? "empty_child" : "leaf",
              })
            }
          >
            <Stack gap="sm" mt="sm">
              <Radio
                value="leaf"
                label={t`Show the row without an expand toggle`}
              />
              <Radio
                value="empty_child"
                label={t`Show an empty row under it`}
              />
            </Stack>
          </Radio.Group>
        )}
        <Switch
          label={t`Offer drill-down`}
          description={t`"Drill into" and "Expand" in the drill menu and chart header.`}
          checked={draft.offerDrill}
          onChange={(event) => update({ offerDrill: event.target.checked })}
        />
        <Switch
          label={t`Dashboard filters can use this hierarchy`}
          description={t`This will display a single, expandable filter widget.`}
          checked={draft.offerTreeFilter}
          onChange={(event) =>
            update({ offerTreeFilter: event.target.checked })
          }
        />
        {!isRecursive && (
          <Switch
            label={t`Hide the individual level columns in Group By pickers`}
            checked={draft.hideLevelColumns}
            onChange={(event) =>
              update({ hideLevelColumns: event.target.checked })
            }
          />
        )}
      </Stack>
    </Stack>
  );
}

// A level picker as wide as the other column pickers, plus its remove button
const LEVEL_ROWS_MAX_WIDTH = COLUMN_SELECT_MAX_WIDTH + 40;

/** The levels top first, each indented under the one above it */
function LevelsEditor({
  values,
  columns,
  onChange,
}: {
  values: (string | null)[];
  columns: LevelColumn[];
  onChange: (values: (string | null)[]) => void;
}) {
  const options = columns.map(
    ({ value, label, icon, group }): ColumnOption => ({
      value,
      label,
      icon,
      group,
    }),
  );
  // Two levels make a hierarchy, so they can't be removed below that
  const canRemove = values.length >= 3;
  // The top level lines up with the heading; each next one steps in
  const getIndent = (index: number) =>
    index === 0 ? 0 : (index - 1) * INDENT_WIDTH;
  const stepIcon = (
    <Box w={16} c="text-secondary" flex="0 0 auto">
      <Icon name="corner_down_right" />
    </Box>
  );
  return (
    <Stack gap="sm">
      <Text fw="bold">{t`Hierarchy levels`}</Text>
      {/* One width for every row: each level steps in, all end together */}
      <Stack gap="sm" maw={LEVEL_ROWS_MAX_WIDTH}>
        {values.map((value, index) => {
          // A column can be one level only
          const taken = values.filter((_, at) => at !== index);
          return (
            <Group key={index} gap="xs" wrap="nowrap" pl={getIndent(index)}>
              {index > 0 && stepIcon}
              <ColumnSelect
                flex={1}
                // The rows' shared width sets this, so right edges line up
                maw="none"
                aria-label={t`Level ${index + 1}`}
                placeholder={t`Pick a column`}
                options={options.filter(
                  (option) => !taken.includes(option.value),
                )}
                value={value}
                searchable
                onChange={(next) =>
                  onChange(
                    values.map((known, at) => (at === index ? next : known)),
                  )
                }
              />
              {canRemove && (
                <ActionIcon
                  variant="subtle"
                  aria-label={t`Remove level`}
                  onClick={() =>
                    onChange(values.filter((_, at) => at !== index))
                  }
                >
                  <Icon name="close" />
                </ActionIcon>
              )}
            </Group>
          );
        })}
      </Stack>
      <Group gap="xs" wrap="nowrap" pl={getIndent(values.length)}>
        {values.length > 0 && stepIcon}
        <Button variant="subtle" onClick={() => onChange([...values, null])}>
          {t`Add level`}
        </Button>
      </Group>
    </Stack>
  );
}
