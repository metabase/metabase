import { useState } from "react";
import { t } from "ttag";

import { skipToken, useGetTableQueryMetadataQuery } from "metabase/api";
import {
  DetailsRow,
  DetailsTable,
  SidebarSection,
} from "metabase/common/components/DetailSidebar";
import {
  type Grouping,
  type GroupingInferenceContext,
  type ResolvedGrouping,
  getGroupingSummary,
  useGroupings,
  useResolvedGroupings,
} from "metabase/metadata/groupings";
import { useValueOrder } from "metabase/metadata/lifecycle";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import {
  ActionIcon,
  Button,
  Group,
  Icon,
  Loader,
  Menu,
  Select,
  Text,
} from "metabase/ui";
import {
  isBoolean,
  isCategory,
  isFK,
  isPK,
} from "metabase-lib/v1/types/utils/isa";
import type { Field, Table } from "metabase-types/api";

import { DETAILS_CELL_INPUT_CLASS_NAMES } from "../../DetailPanel";
import {
  InferredIcon,
  InferredValue,
} from "../../TableSection/InferenceReview";

import { GroupingModal } from "./GroupingModal";

interface GroupingsSectionProps {
  field: Field;
  table: Table;
}

/** The modal's target: a new grouping, or the one being edited */
type EditorState = { grouping: Grouping | undefined };

/**
 * PROTOTYPE: mocked. Ways to group a column's values in Group by: built-in
 * time units and bins, sync's proposals, and an admin's, plus the default.
 */
export function GroupingsSection({ field, table }: GroupingsSectionProps) {
  const readOnly = !table.can_write;
  const fieldId = getRawTableFieldId(field);
  const resolved = useResolvedGroupings(field, table);
  const { saveGrouping, removeGrouping, confirmGrouping, setDefaultGrouping } =
    useGroupings();
  const [editor, setEditor] = useState<EditorState | null>(null);

  // Keys and free text don't group; categories and flags can, once an admin
  // adds one, and a foreign key can group by a column of the table it points to
  const canHaveGroupings =
    resolved.builtIns.length > 0 ||
    resolved.groupings.length > 0 ||
    ((isCategory(field) || isBoolean(field)) && !isPK(field) && !isFK(field)) ||
    (isFK(field) && field.target != null);
  if (!canHaveGroupings) {
    return null;
  }

  const allNames = [...resolved.groupings, ...resolved.builtIns].map(
    ({ name }) => name,
  );

  return (
    <SidebarSection title={t`Field value groupings`}>
      <Text size="sm" c="text-secondary">
        {t`In the query builders, users can select these in the Group By section.`}
      </Text>
      <DetailsTable>
        <DetailsRow
          label={t`Default`}
          fillValue
          value={
            <DefaultGroupingValue
              groupings={resolved.groupings}
              builtIns={resolved.builtIns}
              defaultName={resolved.defaultName}
              isInferred={resolved.isDefaultInferred}
              inference={
                resolved.defaultInference
                  ? t`Inferred: ${resolved.defaultInference.signal}`
                  : null
              }
              readOnly={readOnly}
              onChange={(name) => setDefaultGrouping(fieldId, name)}
            />
          }
        />
        {resolved.groupings.map((grouping) => (
          <DetailsRow
            key={grouping.name}
            label={grouping.name}
            value={
              <GroupingRowValue
                field={field}
                grouping={grouping}
                context={resolved.context}
                readOnly={readOnly}
                onConfirm={() => confirmGrouping(fieldId, grouping.name)}
                onEdit={() => setEditor({ grouping })}
                onRemove={() => removeGrouping(fieldId, grouping.name)}
              />
            }
          />
        ))}
        {resolved.builtIns.length > 0 && (
          <DetailsRow
            label={t`Built-in`}
            value={
              <Text c="text-secondary">
                {resolved.builtIns.map(({ name }) => name).join(", ")}
              </Text>
            }
          />
        )}
      </DetailsTable>
      {!readOnly && (
        <Group>
          <Button
            leftSection={<Icon name="add" />}
            onClick={() => setEditor({ grouping: undefined })}
          >
            {t`Add grouping`}
          </Button>
        </Group>
      )}
      {editor != null && (
        <GroupingModal
          field={field}
          table={table}
          grouping={editor.grouping}
          takenNames={allNames.filter((name) => name !== editor.grouping?.name)}
          context={resolved.context}
          onSave={(grouping) => {
            saveGrouping(fieldId, grouping, editor.grouping?.name);
            setEditor(null);
          }}
          onClose={() => setEditor(null)}
        />
      )}
    </SidebarSection>
  );
}

function DefaultGroupingValue({
  groupings,
  builtIns,
  defaultName,
  isInferred,
  inference,
  readOnly,
  onChange,
}: {
  groupings: Grouping[];
  builtIns: Grouping[];
  defaultName: string | undefined;
  isInferred: boolean;
  inference: string | null;
  readOnly: boolean;
  onChange: (name: string) => void;
}) {
  const [isSelectOpenOnMount, setIsSelectOpenOnMount] = useState(false);

  if (isInferred && defaultName != null) {
    return (
      <InferredValue
        value={defaultName}
        inference={inference}
        readOnly={readOnly}
        onConfirm={() => onChange(defaultName)}
        onChange={() => {
          setIsSelectOpenOnMount(true);
          onChange(defaultName);
        }}
        data-testid="field-default-grouping-review"
      />
    );
  }

  const toItems = (list: Grouping[]) =>
    list.map(({ name }) => ({ value: name, label: name }));

  return (
    <Select<string | null>
      aria-label={t`Default grouping`}
      classNames={DETAILS_CELL_INPUT_CLASS_NAMES}
      data={[
        { group: t`Groupings`, items: toItems(groupings) },
        { group: t`Built-in`, items: toItems(builtIns) },
      ]}
      value={defaultName ?? null}
      placeholder={t`No default`}
      allowDeselect={false}
      disabled={readOnly}
      autoFocus={isSelectOpenOnMount}
      defaultDropdownOpened={isSelectOpenOnMount}
      onChange={(name) => {
        if (name != null) {
          onChange(name);
        }
      }}
      data-testid="field-default-grouping-select"
    />
  );
}

function GroupingRowValue({
  field,
  grouping,
  context,
  readOnly,
  onConfirm,
  onEdit,
  onRemove,
}: {
  field: Field;
  grouping: ResolvedGrouping;
  context: GroupingInferenceContext;
  readOnly: boolean;
  onConfirm: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const isProcess =
    grouping.kind === "partition" && grouping.definition.type === "process";
  // Only process partitions read the status order
  const order = useValueOrder(isProcess ? field : undefined);
  // Only related groupings read the table the foreign key points to
  const relatedTableId =
    grouping.kind === "related" ? field.target?.table_id : undefined;
  const { data: relatedTable, isLoading: isLoadingRelated } =
    useGetTableQueryMetadataQuery(
      relatedTableId != null ? { id: relatedTableId } : skipToken,
    );
  const summary = getGroupingSummary(grouping, {
    fields: context.fields,
    segmentGroups: context.segmentGroups,
    valueOrder: order.values,
    relatedTable,
  });
  const missingLabel =
    grouping.kind === "related"
      ? t`Column not found`
      : t`Segment group not found`;

  return (
    <Group justify="space-between" gap="sm" wrap="nowrap" py="xs">
      <Group gap="xs" wrap="nowrap" miw={0}>
        {order.isLoading || isLoadingRelated ? (
          <Loader size="xs" />
        ) : summary == null ? (
          <Text c="text-disabled">{missingLabel}</Text>
        ) : summary === "" ? (
          <Text c="text-disabled">{t`No cached values`}</Text>
        ) : (
          // Wraps rather than truncates, so long orders stay readable
          <Text>{summary}</Text>
        )}
        {grouping.isInferred && grouping.signal != null && (
          <InferredIcon description={t`Inferred: ${grouping.signal}`} />
        )}
      </Group>
      {!readOnly && (
        <Menu position="bottom-end">
          <Menu.Target>
            <ActionIcon
              size="md"
              variant="subtle"
              flex="0 0 auto"
              aria-label={t`Grouping actions`}
            >
              <Icon name="ellipsis" />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            {grouping.isInferred && (
              <Menu.Item
                leftSection={<Icon name="check" />}
                onClick={onConfirm}
              >
                {t`Confirm`}
              </Menu.Item>
            )}
            <Menu.Item leftSection={<Icon name="pencil" />} onClick={onEdit}>
              {t`Edit`}
            </Menu.Item>
            <Menu.Item
              c="feedback-negative"
              leftSection={<Icon name="trash" />}
              onClick={onRemove}
            >
              {t`Remove`}
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      )}
    </Group>
  );
}
