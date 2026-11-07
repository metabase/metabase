import type { KeyboardEvent, MouseEvent } from "react";
import { useState } from "react";
import { msgid, ngettext, t } from "ttag";

import { skipToken, useGetTableQueryMetadataQuery } from "metabase/api";
import { SidebarSection } from "metabase/common/components/DetailSidebar";
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
import { getRawTableFieldId } from "metabase/metadata/utils/field";
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
  const fieldId = getRawTableFieldId(field);
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
      ? t`Inferred: ${resolved.defaultInference.signal}`
      : null;
  const isBuiltInDefault = resolved.builtIns.some(
    ({ name }) => name === defaultName,
  );
  // The default leads; the rest keep their order
  const groupings = [
    ...resolved.groupings.filter(({ name }) => name === defaultName),
    ...resolved.groupings.filter(({ name }) => name !== defaultName),
  ];
  const builtInCard = resolved.builtIns.length > 0 && (
    <BuiltInGroupingsCard
      builtIns={resolved.builtIns}
      defaultName={isBuiltInDefault ? defaultName : undefined}
      defaultInference={defaultInference}
      readOnly={readOnly}
      onMakeDefault={(name) => setDefaultGrouping(fieldId, name)}
    />
  );

  return (
    <SidebarSection
      title={t`Field value groupings`}
      titleAside={
        !readOnly && (
          <Button
            size="compact-sm"
            variant="subtle"
            leftSection={<Icon name="add" />}
            onClick={() => setEditor({ grouping: undefined })}
          >
            {t`Add grouping`}
          </Button>
        )
      }
      description={t`In the query builders, users can select these in the Group By section.`}
    >
      <Stack gap={rem(12)} role="list">
        {isBuiltInDefault && builtInCard}
        {groupings.map((grouping) => (
          <GroupingCard
            key={grouping.name}
            field={field}
            grouping={grouping}
            context={resolved.context}
            isDefault={grouping.name === defaultName}
            defaultInference={defaultInference}
            readOnly={readOnly}
            onOpen={() => setEditor({ grouping })}
            onMakeDefault={() => setDefaultGrouping(fieldId, grouping.name)}
            onConfirm={() => confirmGrouping(fieldId, grouping.name)}
          />
        ))}
        {!isBuiltInDefault && builtInCard}
        {resolved.groupings.length === 0 && resolved.builtIns.length === 0 && (
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
    </SidebarSection>
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
  onOpen,
  onMakeDefault,
  onConfirm,
}: {
  field: Field;
  grouping: ResolvedGrouping;
  context: GroupingInferenceContext;
  isDefault: boolean;
  /** Why sync picked the default, while it's still a guess */
  defaultInference: string | null;
  readOnly: boolean;
  onOpen: () => void;
  onMakeDefault: () => void;
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
  // Confirming is the AI icons' job; the menu only makes it the default
  const hasActions = !readOnly && !isDefault;

  return (
    <Card
      className={readOnly ? undefined : S.card}
      role={readOnly ? "listitem" : "button"}
      tabIndex={readOnly ? undefined : 0}
      aria-label={grouping.name}
      px="lg"
      py={rem(12)}
      radius="lg"
      shadow="none"
      withBorder
      onClick={readOnly ? undefined : onOpen}
      onKeyDown={(event) => {
        if (!readOnly && event.key === "Enter") {
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
            {grouping.isInferred && grouping.signal != null && (
              <InferredIcon
                description={t`Inferred: ${grouping.signal}`}
                onConfirm={readOnly ? undefined : onConfirm}
              />
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
                <Menu.Item
                  leftSection={<Icon name="star" />}
                  onClick={onMakeDefault}
                >
                  {t`Make default`}
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Box>
        )}
      </Group>
    </Card>
  );
}

/**
 * The time units and bins every column of its type has: not editable, but
 * one of them can be the default.
 */
function BuiltInGroupingsCard({
  builtIns,
  defaultName,
  defaultInference,
  readOnly,
  onMakeDefault,
}: {
  builtIns: Grouping[];
  /** Set when the default is one of these */
  defaultName: string | undefined;
  defaultInference: string | null;
  readOnly: boolean;
  onMakeDefault: (name: string) => void;
}) {
  const isDefaultGuess = defaultName != null && defaultInference != null;
  return (
    <Card
      role="listitem"
      aria-label={t`Built-in groupings`}
      px="lg"
      py={rem(12)}
      radius="lg"
      shadow="none"
      withBorder
    >
      <Group justify="space-between" wrap="nowrap" gap="md">
        <Stack gap="xxs" miw={0}>
          <Flex align="center" gap="sm">
            <Icon name="list" c="text-secondary" />
            <Text fw="bold">{t`Built-in`}</Text>
            {defaultName != null && (
              <DefaultBadge
                label={t`Default: ${defaultName}`}
                inference={isDefaultGuess ? defaultInference : null}
                onConfirm={
                  readOnly ? undefined : () => onMakeDefault(defaultName)
                }
              />
            )}
          </Flex>
          <Text size="sm" c="text-secondary">
            {builtIns.map(({ name }) => name).join(", ")}
          </Text>
        </Stack>
        {!readOnly && (
          <Menu position="bottom-end">
            <Menu.Target>
              <ActionIcon
                variant="subtle"
                aria-label={t`Make a built-in grouping the default`}
              >
                <Icon name="ellipsis" />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown mah={320} style={{ overflowY: "auto" }}>
              <Menu.Label>{t`Make default`}</Menu.Label>
              {builtIns.map(({ name }) => (
                <Menu.Item
                  key={name}
                  rightSection={
                    name === defaultName ? <Icon name="check" /> : null
                  }
                  onClick={() => onMakeDefault(name)}
                >
                  {name}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
        )}
      </Group>
    </Card>
  );
}

/** Marks the grouping Group by uses unless someone picks another */
function DefaultBadge({
  label = t`Default`,
  inference,
  onConfirm,
}: {
  label?: string;
  /** Why sync picked it, while it's still a guess */
  inference: string | null;
  /** Confirms sync's pick, from its AI icon */
  onConfirm?: () => void;
}) {
  return (
    <Group gap="xs" wrap="nowrap" flex="0 0 auto">
      <Badge variant="light">{label}</Badge>
      {inference != null && (
        <InferredIcon description={inference} onConfirm={onConfirm} />
      )}
    </Group>
  );
}

const getBucketCountLabel = (count: number) =>
  ngettext(msgid`${count} bucket`, `${count} buckets`, count);
