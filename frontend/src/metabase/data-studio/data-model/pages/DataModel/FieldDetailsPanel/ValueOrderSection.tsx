import { PointerSensor, useSensor } from "@dnd-kit/core";
import { useState } from "react";
import { t } from "ttag";

import {
  DetailsRow,
  DetailsTable,
  SidebarSection,
} from "metabase/common/components/DetailSidebar";
import { Sortable, SortableList } from "metabase/common/components/Sortable";
import {
  ENUM_KINDS,
  type EnumKind,
  type OrderedValue,
  type ResolvedValueOrder,
  VALUE_BUCKETS,
  getEnumKindLabel,
  getValueBucketLabel,
  inferEnumKind,
  useLifecycle,
  useValueOrder,
} from "metabase/metadata/lifecycle";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import { Card, Group, Icon, Loader, Select, Stack, Text } from "metabase/ui";
import type { Field, Table } from "metabase-types/api";

import { DETAILS_CELL_INPUT_CLASS_NAMES } from "../DetailPanel";
import { InferredValue } from "../TableSection/InferenceReview";

interface ValueOrderSectionProps {
  field: Field;
  table: Table;
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

  // Free-text columns don't need this; lifecycle-like and listed ones do
  const isRelevant =
    overrides.enumKind != null ||
    kindInference.kind !== "nominal" ||
    field.has_field_values === "list";
  if (!isRelevant) {
    return null;
  }

  const saveOrder = (values: OrderedValue[]) => setValueOrder(fieldId, values);

  return (
    <SidebarSection title={t`Values`}>
      <DetailsTable>
        <DetailsRow
          label={t`Kind`}
          fillValue
          value={
            <EnumKindValue
              kind={enumKind}
              isInferred={
                overrides.enumKind == null && kindInference.kind !== "nominal"
              }
              inference={t`Inferred: ${kindInference.signal}`}
              disabled={readOnly}
              onChange={(kind) => setEnumKind(fieldId, kind)}
            />
          }
        />
        {isOrdinal && (
          <DetailsRow
            label={t`Order`}
            value={
              <OrderSummary
                order={order}
                readOnly={readOnly}
                onConfirm={() => saveOrder(order.values)}
              />
            }
          />
        )}
      </DetailsTable>
      {isOrdinal && order.values.length > 0 && (
        <OrderedValueList
          values={order.values}
          // A guess is read-only until confirmed; with no guess, edit away
          isEditable={!readOnly && !order.isInferred}
          onChange={saveOrder}
        />
      )}
    </SidebarSection>
  );
}

function EnumKindValue({
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
  const [isSelectOpenOnMount, setIsSelectOpenOnMount] = useState(false);

  if (isInferred) {
    return (
      <InferredValue
        value={getEnumKindLabel(kind)}
        inference={inference}
        readOnly={disabled}
        onConfirm={() => onChange(kind)}
        onChange={() => {
          setIsSelectOpenOnMount(true);
          onChange(kind);
        }}
        data-testid="field-enum-kind-review"
      />
    );
  }

  return (
    <Select
      aria-label={t`Kind`}
      classNames={DETAILS_CELL_INPUT_CLASS_NAMES}
      data={ENUM_KINDS.map((value) => ({
        value,
        label: getEnumKindLabel(value),
      }))}
      value={kind}
      allowDeselect={false}
      disabled={disabled}
      autoFocus={isSelectOpenOnMount}
      defaultDropdownOpened={isSelectOpenOnMount}
      onChange={(value) => {
        const option = ENUM_KINDS.find((known) => known === value);
        if (option) {
          onChange(option);
        }
      }}
      data-testid="field-enum-kind-select"
    />
  );
}

function OrderSummary({
  order,
  readOnly,
  onConfirm,
}: {
  order: ResolvedValueOrder;
  readOnly: boolean;
  onConfirm: () => void;
}) {
  if (order.isLoading) {
    return <Loader size="xs" />;
  }
  if (order.values.length === 0) {
    return (
      <Text c="text-secondary">
        {t`No cached values. Re-scan this column's values to order them.`}
      </Text>
    );
  }
  const openCount = order.values.filter(
    ({ bucket }) => bucket === "open",
  ).length;
  const summary = t`${order.values.length} values, ${openCount} open`;
  if (order.isInferred) {
    // Confirming saves the guess, which makes the list below editable
    return (
      <InferredValue
        value={summary}
        inference={t`Inferred: ${order.inference.signal}`}
        readOnly={readOnly}
        isInset={false}
        onConfirm={onConfirm}
        onChange={onConfirm}
        data-testid="field-value-order-review"
      />
    );
  }
  return (
    <Text>
      {order.isSaved
        ? summary
        : t`${summary}. Drag values below to put them in lifecycle order.`}
    </Text>
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
