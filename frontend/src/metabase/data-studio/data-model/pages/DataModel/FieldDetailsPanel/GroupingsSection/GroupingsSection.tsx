import type { KeyboardEvent, MouseEvent } from "react";
import { useState } from "react";
import { msgid, ngettext, t } from "ttag";

import { skipToken, useGetTableQueryMetadataQuery } from "metabase/api";
import {
  type Grouping,
  type GroupingInferenceContext,
  type ResolvedGrouping,
  type ResolvedGroupings,
  getGroupingBucketCount,
  getGroupingStrategy,
  useGroupings,
  useResolvedGroupings,
} from "metabase/metadata/groupings";
import { useValueOrder } from "metabase/metadata/lifecycle";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Card,
  Flex,
  Group,
  Icon,
  Menu,
  Stack,
  Text,
  rem,
} from "metabase/ui";
import {
  isBoolean,
  isCategory,
  isFK,
  isPK,
} from "metabase-lib/v1/types/utils/isa";
import type { Field, IconName, Table } from "metabase-types/api";

import { InferredIcon } from "../../TableSection/InferenceReview";
import { ListEmptyItem } from "../../TableSection/ListSection";

import { GroupingModal } from "./GroupingModal";
import S from "./GroupingsSection.module.css";

interface GroupingsSectionProps {
  field: Field;
  table: Table;
}

/** The modal's target: a new grouping, or the one being edited */
type EditorState = { grouping: Grouping | undefined };

/**
 * Whether a column takes groupings. Keys and free text don't group;
 * categories and flags can, once an admin adds one, and a foreign key can
 * group by a column of the table it points to.
 */
export function useCanHaveGroupings(field: Field, table: Table): boolean {
  const resolved = useResolvedGroupings(field, table);
  return canHaveGroupings(field, resolved);
}

const canHaveGroupings = (
  field: Field,
  resolved: Pick<ResolvedGroupings, "builtIns" | "groupings">,
) =>
  resolved.builtIns.length > 0 ||
  resolved.groupings.length > 0 ||
  ((isCategory(field) || isBoolean(field)) && !isPK(field) && !isFK(field)) ||
  (isFK(field) && field.target != null);

/**
 * PROTOTYPE: mocked. Ways to group a column's values in Group by: built-in
 * time units and bins, sync's proposals, and an admin's, plus the default.
 */
export function GroupingsSection({ field, table }: GroupingsSectionProps) {
  const readOnly = !table.can_write;
  const fieldId = field.id;
  const resolved = useResolvedGroupings(field, table);
  const { saveGrouping, removeGrouping, confirmGrouping, setDefaultGrouping } =
    useGroupings();
  const [editor, setEditor] = useState<EditorState | null>(null);

  if (!canHaveGroupings(field, resolved)) {
    return null;
  }

  const allNames = [...resolved.groupings, ...resolved.builtIns].map(
    ({ name }) => name,
  );
  const defaultName = resolved.defaultName;
  const defaultInference =
    resolved.isDefaultInferred && resolved.defaultInference
      ? resolved.defaultInference.signal
      : null;
  // The default leads; then built-ins, then sync's and an admin's
  const all = [
    ...resolved.builtIns.map((grouping) => ({
      grouping: { ...grouping, isInferred: false },
      isBuiltIn: true,
    })),
    ...resolved.groupings.map((grouping) => ({ grouping, isBuiltIn: false })),
  ];
  const listed = [
    ...all.filter(({ grouping }) => grouping.name === defaultName),
    ...all.filter(({ grouping }) => grouping.name !== defaultName),
  ];

  // The tab names the section, so only its description and action show
  return (
    <Stack gap="lg">
      <Flex justify="space-between" align="center" gap="md">
        <Text size="sm" c="text-secondary">
          {t`Users can group by these in query builders.`}
        </Text>
        {!readOnly && (
          <Button
            size="compact-sm"
            variant="subtle"
            leftSection={<Icon name="add" />}
            onClick={() => setEditor({ grouping: undefined })}
          >
            {t`Add bucket`}
          </Button>
        )}
      </Flex>
      <Stack gap={rem(12)} role="list">
        {listed.map(({ grouping, isBuiltIn }) => (
          <GroupingCard
            key={`${isBuiltIn ? "built-in" : "custom"}:${grouping.name}`}
            field={field}
            grouping={grouping}
            context={resolved.context}
            isDefault={grouping.name === defaultName}
            defaultInference={defaultInference}
            readOnly={readOnly}
            isBuiltIn={isBuiltIn}
            onOpen={() => setEditor({ grouping })}
            onMakeDefault={() => setDefaultGrouping(fieldId, grouping.name)}
            onRemove={() => removeGrouping(fieldId, grouping.name)}
            onConfirm={() => confirmGrouping(fieldId, grouping.name)}
          />
        ))}
        {listed.length === 0 && (
          <ListEmptyItem>{t`No groupings yet`}</ListEmptyItem>
        )}
      </Stack>
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
          onRemove={
            editor.grouping
              ? () => {
                  if (editor.grouping) {
                    removeGrouping(fieldId, editor.grouping.name);
                  }
                  setEditor(null);
                }
              : undefined
          }
          onClose={() => setEditor(null)}
        />
      )}
    </Stack>
  );
}

const KIND_ICONS: Record<Grouping["kind"], IconName> = {
  time: "calendar",
  bins: "bar",
  partition: "label",
  related: "connections",
};

/** Opens on a click or Enter, while its menu's clicks stay its own */
const stopPropagation = (event: MouseEvent | KeyboardEvent) =>
  event.stopPropagation();

function GroupingCard({
  field,
  grouping,
  context,
  isDefault,
  defaultInference,
  readOnly,
  isBuiltIn,
  onOpen,
  onMakeDefault,
  onRemove,
  onConfirm,
}: {
  field: Field;
  grouping: ResolvedGrouping;
  context: GroupingInferenceContext;
  isDefault: boolean;
  /** Why sync picked the default, while it's still a guess */
  defaultInference: string | null;
  readOnly: boolean;
  /** Every column of its type has it; it can be the default, not edited */
  isBuiltIn: boolean;
  onOpen: () => void;
  onMakeDefault: () => void;
  onRemove: () => void;
  onConfirm: () => void;
}) {
  const isProcess =
    grouping.kind === "partition" && grouping.definition.type === "process";
  // Only process partitions read the status order
  const order = useValueOrder(isProcess ? field : undefined);
  // Only related groupings read the table the foreign key points to
  const relatedTableId =
    grouping.kind === "related" ? field.target?.table_id : undefined;
  const { data: relatedTable } = useGetTableQueryMetadataQuery(
    relatedTableId != null ? { id: relatedTableId } : skipToken,
  );
  const descriptionContext = {
    fields: context.fields,
    segmentGroups: context.segmentGroups,
    valueOrder: order.values,
    relatedTable,
  };
  const strategy =
    getGroupingStrategy(grouping, descriptionContext) ??
    (grouping.kind === "related"
      ? t`Column not found`
      : t`Segment group not found`);
  const bucketCount = getGroupingBucketCount(grouping, descriptionContext);
  const isDefaultGuess = isDefault && defaultInference != null;
  // Built-ins can't be edited, so only the others open
  const isEditable = !readOnly && !isBuiltIn;
  // Confirming is the AI icons' job; the menu makes it the default, and
  // removes it unless it's built in
  const hasActions = !readOnly && (!isDefault || !isBuiltIn);

  return (
    <Card
      className={isEditable ? S.card : undefined}
      role={isEditable ? "button" : "listitem"}
      tabIndex={isEditable ? 0 : undefined}
      aria-label={grouping.name}
      px="lg"
      py={rem(12)}
      radius="lg"
      shadow="none"
      withBorder
      onClick={isEditable ? onOpen : undefined}
      onKeyDown={(event) => {
        if (isEditable && event.key === "Enter") {
          onOpen();
        }
      }}
    >
      <Group justify="space-between" wrap="nowrap" gap="md">
        <Stack gap="xxs" miw={0}>
          <Flex align="center" gap="sm">
            <Icon name={KIND_ICONS[grouping.kind]} c="core-brand" />
            <Text fw="bold" truncate>
              {grouping.name}
            </Text>
            {isBuiltIn ? (
              <Badge variant="light" color="neutral" flex="0 0 auto">
                {t`Built-in`}
              </Badge>
            ) : (
              grouping.isInferred &&
              grouping.signal != null && (
                <InferredIcon
                  description={grouping.signal}
                  onConfirm={readOnly ? undefined : onConfirm}
                />
              )
            )}
            {isDefault && (
              <DefaultBadge
                inference={isDefaultGuess ? defaultInference : null}
                onConfirm={readOnly ? undefined : onMakeDefault}
              />
            )}
          </Flex>
          <Text size="sm" c="text-secondary">
            {bucketCount != null
              ? `${strategy} · ${getBucketCountLabel(bucketCount)}`
              : strategy}
          </Text>
        </Stack>
        {hasActions && (
          <Box onClick={stopPropagation} onKeyDown={stopPropagation}>
            <Menu position="bottom-end">
              <Menu.Target>
                <ActionIcon
                  variant="subtle"
                  aria-label={t`Actions for ${grouping.name}`}
                >
                  <Icon name="ellipsis" />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                {!isDefault && (
                  <Menu.Item
                    leftSection={<Icon name="star" />}
                    onClick={onMakeDefault}
                  >
                    {t`Make default`}
                  </Menu.Item>
                )}
                {!isBuiltIn && (
                  <Menu.Item
                    leftSection={<Icon name="trash" />}
                    c="feedback-negative"
                    onClick={onRemove}
                  >
                    {t`Remove`}
                  </Menu.Item>
                )}
              </Menu.Dropdown>
            </Menu>
          </Box>
        )}
      </Group>
    </Card>
  );
}

/** Marks the grouping Group by uses unless someone picks another */
function DefaultBadge({
  inference,
  onConfirm,
}: {
  /** Why sync picked it, while it's still a guess */
  inference: string | null;
  /** Confirms sync's pick, from its AI icon */
  onConfirm?: () => void;
}) {
  return (
    <Group gap="xs" wrap="nowrap" flex="0 0 auto">
      <Badge variant="light">{t`Default`}</Badge>
      {inference != null && (
        <InferredIcon description={inference} onConfirm={onConfirm} />
      )}
    </Group>
  );
}

const getBucketCountLabel = (count: number) =>
  ngettext(msgid`${count} bucket`, `${count} buckets`, count);
