import { PointerSensor, useSensor } from "@dnd-kit/core";
import { t } from "ttag";

import { SidebarSection } from "metabase/common/components/DetailSidebar";
import { Sortable, SortableList } from "metabase/common/components/Sortable";
import {
  ENUM_KINDS,
  type EnumKind,
  type OrderedValue,
  type ResolvedValueOrder,
  VALUE_BUCKETS,
  getEnumKindDescription,
  getEnumKindLabel,
  getValueBucketLabel,
  inferEnumKind,
  useLifecycle,
  useValueOrder,
} from "metabase/metadata/lifecycle";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { Card, Group, Icon, Loader, Select, Stack, Text } from "metabase/ui";
import type { Field, Table } from "metabase-types/api";

import { InferredIcon } from "../TableSection/InferenceReview";

interface ValueOrderSectionProps {
  field: Field;
  table: Table;
}

/** Whether a column's values have a kind worth setting, so the section shows */
export function useHasValueKind(field: Field): boolean {
  const { getFieldLifecycle } = useLifecycle();
  // Free-text columns don't need this; lifecycle-like and listed ones do
  return (
    getFieldLifecycle(getRawTableFieldId(field)).enumKind != null ||
    inferEnumKind(field).kind !== "nominal" ||
    field.has_field_values === "list"
  );
}

/**
 * PROTOTYPE: mocked. How a column's values relate, and for an ordered one,
 * its values in lifecycle order with open, won, lost, and cancelled buckets.
 * A table's process reads this order as its states.
 */
export function ValueOrderSection({ field, table }: ValueOrderSectionProps) {
  const readOnly = !table.can_write;
  const fieldId = getRawTableFieldId(field);
  const { getFieldLifecycle, setEnumKind, setValueOrder } = useLifecycle();
  const overrides = getFieldLifecycle(fieldId);
  const kindInference = inferEnumKind(field);
  const enumKind = overrides.enumKind ?? kindInference.kind;
  const isOrdinal = enumKind === "ordinal";
  const order = useValueOrder(isOrdinal ? field : undefined);
  const hasValueKind = useHasValueKind(field);

  if (!hasValueKind) {
    return null;
  }

  const saveOrder = (values: OrderedValue[]) => setValueOrder(fieldId, values);

  return (
    <SidebarSection title={t`Values`}>
      <EnumKindSelect
        kind={enumKind}
        isInferred={
          overrides.enumKind == null && kindInference.kind !== "nominal"
        }
        inference={t`Inferred: ${kindInference.signal}`}
        disabled={readOnly}
        onChange={(kind) => setEnumKind(fieldId, kind)}
      />
      {isOrdinal && (
        <ValueOrder
          order={order}
          readOnly={readOnly}
          onChange={saveOrder}
          onConfirm={() => saveOrder(order.values)}
        />
      )}
    </SidebarSection>
  );
}

/**
 * How the values relate. Each option explains itself in the dropdown; a
 * guess carries the AI icon, and picking any option, even the guess, saves it.
 */
function EnumKindSelect({
  kind,
  isInferred,
  inference,
  disabled,
  onChange,
}: {
  kind: EnumKind;
  isInferred: boolean;
  inference: string;
  disabled: boolean;
  onChange: (kind: EnumKind) => void;
}) {
  return (
    <Select
      label={t`Kind`}
      data={ENUM_KINDS.map((value) => ({
        value,
        label: getEnumKindLabel(value),
      }))}
      value={kind}
      allowDeselect={false}
      disabled={disabled}
      leftSection={
        isInferred ? (
          <InferredIcon
            description={inference}
            onConfirm={disabled ? undefined : () => onChange(kind)}
          />
        ) : undefined
      }
      // "all" lets the AI icon be clicked and show its tooltip
      leftSectionPointerEvents="all"
      renderOption={({ option }) => {
        const optionKind = ENUM_KINDS.find((known) => known === option.value);
        return (
          <Stack gap={2} py={2}>
            <Text>{option.label}</Text>
            {optionKind && (
              <Text size="sm" c="text-secondary">
                {getEnumKindDescription(optionKind)}
              </Text>
            )}
          </Stack>
        );
      }}
      // Fires for the current value too, so picking sync's guess confirms it
      onOptionSubmit={(value) => {
        const option = ENUM_KINDS.find((known) => known === value);
        if (option) {
          onChange(option);
        }
      }}
      data-testid="field-enum-kind-select"
    />
  );
}

/**
 * The values in lifecycle order, right under the Kind row. While it's sync's
 * guess, a line below says so, with the AI icon to confirm it; dragging a
 * value or changing a bucket also saves it.
 */
function ValueOrder({
  order,
  readOnly,
  onChange,
  onConfirm,
}: {
  order: ResolvedValueOrder;
  readOnly: boolean;
  onChange: (values: OrderedValue[]) => void;
  onConfirm: () => void;
}) {
  const hasValues = order.values.length > 0;
  return (
    <Stack gap="sm">
      {order.isLoading ? (
        <Loader size="xs" />
      ) : !hasValues ? (
        <Text c="text-secondary">
          {t`No cached values. Re-scan this column's values to order them.`}
        </Text>
      ) : (
        <OrderedValueList
          values={order.values}
          isEditable={!readOnly}
          onChange={onChange}
        />
      )}
      {hasValues && order.isInferred && (
        <Group gap="xs" wrap="nowrap">
          <Text size="sm" c="text-secondary">
            {t`Guessed order`}
          </Text>
          <InferredIcon
            description={t`Inferred: ${order.inference.signal}`}
            onConfirm={readOnly ? undefined : onConfirm}
          />
        </Group>
      )}
    </Stack>
  );
}

function OrderedValueList({
  values,
  isEditable,
  onChange,
}: {
  values: OrderedValue[];
  isEditable: boolean;
  onChange: (values: OrderedValue[]) => void;
}) {
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 5 },
  });
  const byValue = new Map(values.map((value) => [value.value, value]));

  const handleBucketChange = (value: string, bucket: OrderedValue["bucket"]) =>
    onChange(
      values.map((orderedValue) =>
        orderedValue.value === value
          ? { ...orderedValue, bucket }
          : orderedValue,
      ),
    );

  return (
    <Stack gap="xs" role="list" aria-label={t`Values in lifecycle order`}>
      <SortableList<OrderedValue>
        items={values}
        getId={({ value }) => value}
        sensors={[pointerSensor]}
        renderItem={({ item, index }) => (
          <Sortable
            key={item.value}
            id={item.value}
            disabled={!isEditable}
            draggingStyle={{ opacity: 0.5 }}
          >
            <OrderedValueRow
              value={item}
              rank={index + 1}
              isEditable={isEditable}
              onBucketChange={(bucket) =>
                handleBucketChange(item.value, bucket)
              }
            />
          </Sortable>
        )}
        onSortEnd={({ itemIds }) =>
          onChange(
            itemIds.flatMap((id) => {
              const value = byValue.get(String(id));
              return value ? [value] : [];
            }),
          )
        }
      />
    </Stack>
  );
}

function OrderedValueRow({
  value,
  rank,
  isEditable,
  onBucketChange,
}: {
  value: OrderedValue;
  rank: number;
  isEditable: boolean;
  onBucketChange: (bucket: OrderedValue["bucket"]) => void;
}) {
  return (
    <Card
      role="listitem"
      aria-label={value.value}
      withBorder
      shadow="none"
      radius="md"
      px="sm"
      py="xs"
      style={{ cursor: isEditable ? "grab" : undefined }}
    >
      <Group gap="sm" wrap="nowrap" justify="space-between">
        <Group gap="sm" wrap="nowrap" miw={0}>
          {isEditable && (
            <Icon name="grabber" c="text-secondary" flex="0 0 auto" />
          )}
          <Text c="text-secondary" w="1.5rem" ta="end" flex="0 0 auto">
            {rank}
          </Text>
          <Text truncate>{value.value}</Text>
        </Group>
        {isEditable ? (
          <Select
            aria-label={t`Bucket for ${value.value}`}
            size="xs"
            w={130}
            data={VALUE_BUCKETS.map((bucket) => ({
              value: bucket,
              label: getValueBucketLabel(bucket),
            }))}
            value={value.bucket}
            allowDeselect={false}
            onChange={(next) => {
              const bucket = VALUE_BUCKETS.find((known) => known === next);
              if (bucket) {
                onBucketChange(bucket);
              }
            }}
          />
        ) : (
          <Text c="text-secondary" flex="0 0 auto">
            {getValueBucketLabel(value.bucket)}
          </Text>
        )}
      </Group>
    </Card>
  );
}
