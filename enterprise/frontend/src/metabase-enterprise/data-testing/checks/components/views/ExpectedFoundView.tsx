import { t } from "ttag";

import { Box, Group, Stack, Text } from "metabase/ui";

import type {
  DataCheckDefinition,
  DataCheckResult,
  DataCheckValue,
} from "../../types";

import { FailingRowsView } from "./FailingRowsView";
import { GenericResultView } from "./GenericResultView";
import type { DataCheckViewProps } from "./types";

type ItemState = "matched" | "missing" | "unexpected";

type ComparedItem = {
  label: string;
  state: ItemState;
};

type ExpectedFound = {
  expectedLabel: string;
  foundLabel: string;
  expected: ComparedItem[];
  found: ComparedItem[];
};

export function ExpectedFoundView(props: DataCheckViewProps) {
  const comparison = getExpectedFound(props.definition, props.result);
  if (comparison == null) {
    return <GenericResultView {...props} />;
  }

  return (
    <Stack gap="md">
      <ItemRow label={comparison.expectedLabel} items={comparison.expected} />
      <ItemRow label={comparison.foundLabel} items={comparison.found} />
      <FailingRowsView {...props} />
    </Stack>
  );
}

type ItemRowProps = {
  label: string;
  items: ComparedItem[];
};

function ItemRow({ label, items }: ItemRowProps) {
  return (
    <Group align="start" wrap="nowrap" gap="md">
      <Text c="text-secondary" w="8rem" flex="none">
        {label}
      </Text>
      <Group gap="sm">
        {items.length === 0 && <Text c="text-secondary">{t`Nothing`}</Text>}
        {items.map((item) => (
          <Item key={item.label} item={item} />
        ))}
      </Group>
    </Group>
  );
}

function Item({ item }: { item: ComparedItem }) {
  const { label, state } = item;
  return (
    <Group
      gap="xs"
      px="sm"
      py={2}
      bdrs="sm"
      bd={
        state === "missing"
          ? "1px dashed var(--mb-color-feedback-negative)"
          : state === "unexpected"
            ? "1px solid var(--mb-color-feedback-negative)"
            : "1px solid var(--mb-color-border-neutral)"
      }
    >
      <Box ff="monospace" fz="sm" fw={state === "matched" ? undefined : "bold"}>
        {label}
      </Box>
      {state !== "matched" && (
        <Text fz="xs" c="feedback-negative">
          {state === "missing" ? t`missing` : t`unexpected`}
        </Text>
      )}
    </Group>
  );
}

function toLabels(value: DataCheckValue | undefined): string[] | null {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return value;
  }
  return null;
}

function compareLabels(
  expectedLabels: string[],
  foundLabels: string[],
  anyOf: boolean,
): Pick<ExpectedFound, "expected" | "found"> {
  const normalize = (label: string) => label.toLowerCase();
  const expectedSet = new Set(expectedLabels.map(normalize));
  const foundSet = new Set(foundLabels.map(normalize));
  return {
    expected: expectedLabels.map((label) => ({
      label,
      state: anyOf || foundSet.has(normalize(label)) ? "matched" : "missing",
    })),
    found: foundLabels.map((label) => ({
      label,
      state: expectedSet.has(normalize(label)) ? "matched" : "unexpected",
    })),
  };
}

function getExpectedFound(
  definition: DataCheckDefinition,
  result: DataCheckResult,
): ExpectedFound | null {
  const { metric, threshold } = result;
  const { column } = definition.params;

  if (typeof metric === "boolean" && typeof column === "string") {
    return {
      expectedLabel: t`Expected column`,
      foundLabel: t`Found`,
      ...compareLabels([column], metric ? [column] : [], false),
    };
  }
  const expected = toLabels(threshold);
  const found = toLabels(metric);
  if (expected == null || found == null) {
    return null;
  }
  if (definition.check === "column_type") {
    return {
      expectedLabel: t`Expected type`,
      foundLabel: t`Found type`,
      ...compareLabels(expected, found, true),
    };
  }
  if (definition.check === "most_common_value_in") {
    return {
      expectedLabel: t`Allowed values`,
      foundLabel: t`Most common`,
      ...compareLabels(expected, found, true),
    };
  }
  return {
    expectedLabel: t`Expected`,
    foundLabel: t`Found`,
    ...compareLabels(expected, found, false),
  };
}
