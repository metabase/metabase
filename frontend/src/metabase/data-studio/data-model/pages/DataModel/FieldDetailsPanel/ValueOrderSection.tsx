import { PointerSensor, useSensor } from "@dnd-kit/core";
import { t } from "ttag";

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
import {
  Card,
  Center,
  Group,
  Icon,
  Loader,
  Radio,
  Select,
  Stack,
  Text,
} from "metabase/ui";
import type { Field, Table } from "metabase-types/api";

import { InferredIcon } from "../TableSection/InferenceReview";

// The outcome group column, lined up with its label above the rows
const BUCKET_SELECT_WIDTH = 130;
const RANK_SIZE = 20;

interface ValueOrderSectionProps {
  field: Field;
  table: Table;
}

/** Whether a column's values have a kind worth setting, so the section shows */
export function useHasValueKind(field: Field): boolean {
  const { getFieldLifecycle } = useLifecycle();
  // Free-text columns don't need this; lifecycle-like and listed ones do
  return (
    getFieldLifecycle(field.id).enumKind != null ||
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
  const fieldId = field.id;
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

  // The tab names the section, so it has no heading of its own
  return (
    <Stack gap="xl">
      <EnumKindRadioGroup
        kind={enumKind}
        isInferred={
          overrides.enumKind == null && kindInference.kind !== "nominal"
        }
        inference={kindInference.signal}
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
    </Stack>
  );
}

/**
 * How the values relate, each option explained. Sync's guess carries the AI
 * icon, which confirms it; picking any other option saves that one.
 */
function EnumKindRadioGroup({
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
    <Radio.Group
      label={t`What kind of values are these?`}
      value={kind}
      onChange={(value) => {
        const option = ENUM_KINDS.find((known) => known === value);
        if (option) {
          onChange(option);
        }
      }}
      data-testid="field-enum-kind-radio-group"
    >
      <Stack gap="md" mt="sm">
        {ENUM_KINDS.map((option) => (
          <Radio
            key={option}
            value={option}
            disabled={disabled}
            label={
              <Group gap="xs" wrap="nowrap">
                {getEnumKindLabel(option)}
                {isInferred && option === kind && (
                  <InferredIcon
                    description={inference}
                    onConfirm={disabled ? undefined : () => onChange(kind)}
                  />
                )}
              </Group>
            }
            description={getEnumKindDescription(option)}
          />
        ))}
      </Stack>
    </Radio.Group>
  );
}

/**
 * The values in lifecycle order, right under the kinds. While it's sync's
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
      <Group justify="space-between" wrap="nowrap" align="flex-end">
        <Text fw="bold">{t`Values order`}</Text>
        {hasValues && !order.isLoading && (
          // Sits over the rows' selects, inside the cards' padding
          <Text size="sm" c="text-secondary" w={BUCKET_SELECT_WIDTH} mr="sm">
            {t`Outcome group`}
          </Text>
        )}
      </Group>
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
            description={order.inference.signal}
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
        <Group gap="md" wrap="nowrap" miw={0}>
          <Group gap="sm" wrap="nowrap" flex="0 0 auto">
            {isEditable && (
              <Icon name="grabber" c="text-secondary" flex="0 0 auto" />
            )}
            <Center
              w={RANK_SIZE}
              h={RANK_SIZE}
              bg="background_page-secondary"
              bdrs="50%"
              flex="0 0 auto"
            >
              <Text size="sm" c="text-secondary" lh={1}>
                {rank}
              </Text>
            </Center>
          </Group>
          <Text truncate>{value.value}</Text>
        </Group>
        {isEditable ? (
          <Select
            aria-label={t`Outcome group for ${value.value}`}
            size="xs"
            w={BUCKET_SELECT_WIDTH}
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
          <Text c="text-secondary" w={BUCKET_SELECT_WIDTH} flex="0 0 auto">
            {getValueBucketLabel(value.bucket)}
          </Text>
        )}
      </Group>
    </Card>
  );
}
