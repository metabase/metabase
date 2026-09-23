import { useEffect, useRef } from "react";
import { t } from "ttag";

import { useSuggestEntityTypeMutation } from "metabase/api/jev";
import { getEntityIcon } from "metabase/detail-view/utils";
import {
  Button,
  Group,
  Icon,
  Select,
  SelectItem,
  type SelectProps,
  Stack,
  Text,
} from "metabase/ui";
import type { Table } from "metabase-types/api";

interface Props extends Omit<SelectProps, "data" | "value" | "onChange"> {
  table?: Table;
  value: Table["entity_type"];
  onChange: (value: Table["entity_type"]) => void;
}

export const EntityTypeInput = ({
  table,
  comboboxProps,
  value,
  onChange,
  ...props
}: Props) => {
  const entities = [
    { value: "entity/GenericTable", label: t`Generic` },
    { value: "entity/UserTable", label: t`Person` },
    { value: "entity/CompanyTable", label: t`Company` },
    { value: "entity/TransactionTable", label: t`Transaction` },
    { value: "entity/ProductTable", label: t`Product` },
    { value: "entity/SubscriptionTable", label: t`Subscription` },
    { value: "entity/EventTable", label: t`Event` },
  ];

  return (
    <Select
      comboboxProps={{
        middlewares: {
          flip: true,
          size: {
            padding: 6,
          },
        },
        position: "bottom-start",
        ...comboboxProps,
      }}
      data={entities}
      label={t`Entity type`}
      renderOption={(item) => {
        const selected = item.option.value === value;

        return (
          <SelectItem selected={selected}>
            <Group align="center" gap="sm" justify="center">
              <Icon name={getEntityIcon(item.option.value)} />
              <span>{item.option.label}</span>
            </Group>
          </SelectItem>
        );
      }}
      leftSection={value ? <Icon name={getEntityIcon(value)} /> : undefined}
      placeholder={t`Select entity type`}
      value={value}
      onChange={(value) => onChange(value)}
      {...props}
      description={
        table && value === "entity/GenericTable" ? (
          <EntityTypeSuggestion
            key={table.id}
            table={table}
            entities={entities}
            value={value}
            onChange={onChange}
            disabled={props.disabled || props.readOnly}
          />
        ) : (
          props.description
        )
      }
      descriptionProps={{
        ...props.descriptionProps,
        style: { gridColumn: 2, ...props.descriptionProps?.style },
      }}
      inputWrapperOrder={["label", "input", "description", "error"]}
    />
  );
};

function EntityTypeSuggestion({
  table,
  entities,
  value,
  onChange,
  disabled,
}: Pick<Props, "value" | "onChange" | "disabled"> & {
  table: Table;
  entities: { value: string; label: string }[];
}) {
  const [suggest, { data, isLoading, isError }] =
    useSuggestEntityTypeMutation();
  const hasRequested = useRef(false);

  useEffect(() => {
    if (!disabled && !hasRequested.current) {
      hasRequested.current = true;
      suggest(table);
    }
  }, [disabled, suggest, table]);

  const probabilities = data?.answers?.entity_type?.probabilities ?? {};
  const best = Object.entries(probabilities)
    .filter(
      ([, confidence]) =>
        Number.isFinite(confidence) && confidence > 0 && confidence <= 1,
    )
    .sort(([, a], [, b]) => b - a)[0];
  const suggestion = entities.find((entity) => entity.value === best?.[0]);
  const confidencePercent = best ? Math.round(best[1] * 100) : null;
  const hasError = isError || data?.error != null;

  return (
    <Stack component="span" gap="xs" mt="xs" align="flex-start">
      {(!suggestion || hasError) && (
        <Button
          size="compact-sm"
          variant="subtle"
          leftSection={<Icon name="sparkles" size={12} aria-hidden />}
          loading={isLoading}
          disabled={disabled}
          onClick={() => suggest(table)}
        >
          {t`Suggest entity type`}
        </Button>
      )}
      <Text component="span" size="xs" aria-live="polite">
        {!isLoading &&
          (hasError ? (
            t`Couldn't suggest an entity type. Try again.`
          ) : suggestion ? (
            <Group component="span" gap="xs">
              {suggestion.value === value ? (
                t`Jev agrees with the current entity type.`
              ) : (
                <Button
                  size="compact-sm"
                  variant="light"
                  disabled={disabled}
                  onClick={() => onChange(suggestion.value)}
                >
                  {t`Use ${suggestion.label}`}
                </Button>
              )}
              <Text component="span" size="xs" c="text-secondary">
                {t`${confidencePercent}% confidence`}
              </Text>
            </Group>
          ) : data ? (
            t`No entity type suggestion available.`
          ) : null)}
      </Text>
    </Stack>
  );
}
