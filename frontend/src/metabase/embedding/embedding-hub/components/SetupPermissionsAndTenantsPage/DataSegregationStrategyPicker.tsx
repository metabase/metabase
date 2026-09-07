/* eslint-disable metabase/no-literal-metabase-strings -- This string only shows for admins */

import { t } from "ttag";

import { Button, FixedSizeIcon, Flex, Radio, Stack } from "metabase/ui";
import type { DataSegregationStrategy, IconName } from "metabase-types/api";

interface DataSegregationStrategyPickerProps {
  value: DataSegregationStrategy | null;
  onChange: (value: DataSegregationStrategy) => void;
  onConfirm: () => void;
}

interface StrategyOption {
  id: DataSegregationStrategy;
  icon: IconName;
  label: string;
  description: string;
  confirmText: string;
}

const getOptions = (): StrategyOption[] => [
  {
    id: "row-column-level-security",
    icon: "layout_grid",
    label: t`Row and column level security`,
    description: t`All data is stored in the same database and Metabase will apply a filter to queries for a table column to match a specific value (ex: customerId = 2).`,
    confirmText: t`Use row and column level security`,
  },
  {
    id: "connection-impersonation",
    icon: "corner_up_right",
    label: t`Connection impersonation`,
    description: t`All data is stored in the same database, but Metabase will use a different database role to connect for each tenant. Roles are configured at the database level to only query relevant data.`,
    confirmText: t`Use connection impersonation`,
  },
  {
    id: "database-routing",
    icon: "database_routing",
    label: t`Database routing`,
    description: t`Each tenant has their own database with identical schema. Metabase will use a connection string from a tenant attribute to run queries against a different destination database.`,
    confirmText: t`Use database routing`,
  },
];

export const DataSegregationStrategyPicker = ({
  value,
  onChange,
  onConfirm,
}: DataSegregationStrategyPickerProps) => {
  const options = getOptions();
  const selectedOption =
    options.find((option) => option.id === value) ?? options[0];

  return (
    <Stack gap="lg">
      <Radio.Group
        value={value}
        // Unjustified type cast. FIXME
        onChange={(nextValue) => onChange(nextValue as DataSegregationStrategy)}
      >
        <Stack gap="lg">
          {options.map((strategy) => (
            <Radio.Card
              key={strategy.id}
              value={strategy.id}
              label={strategy.label}
              description={strategy.description}
              leftSection={
                <FixedSizeIcon
                  name={strategy.icon}
                  color="core-brand"
                  w={24}
                  h={24}
                />
              }
              data-testid={`strategy-card-${strategy.id}`}
              withIndicator={false}
            />
          ))}
        </Stack>
      </Radio.Group>

      <Flex justify="flex-end">
        <Button variant="filled" disabled={!value} onClick={onConfirm}>
          {selectedOption.confirmText}
        </Button>
      </Flex>
    </Stack>
  );
};
