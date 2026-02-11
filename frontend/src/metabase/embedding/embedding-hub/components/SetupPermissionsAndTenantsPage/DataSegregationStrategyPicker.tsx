/* eslint-disable metabase/no-literal-metabase-strings -- This string only shows for admins */

import { t } from "ttag";

import type { IconName } from "metabase/ui";
import { Button, Flex, Group, Icon, Radio, Stack, Text } from "metabase/ui";

import S from "./DataSegregationStrategyPicker.module.css";

export type DataSegregationStrategy =
  | "row-column-level-security"
  | "connection-impersonation"
  | "database-routing";

interface DataSegregationStrategyPickerProps {
  value: DataSegregationStrategy | null;
  onChange: (value: DataSegregationStrategy) => void;
  onConfirm: () => void;
}

interface StrategyOption {
  id: DataSegregationStrategy;
  icon: IconName;
  title: string;
  description: string;
  confirmText: string;
}

const getOptions = (): StrategyOption[] => [
  {
    id: "row-column-level-security",
    icon: "layout_grid",
    title: t`Row and column level security`,
    description: t`All data is stored in the same database and Metabase will apply a filter to queries for a table column to match a specific value (ex: customerId = 2).`,
    confirmText: t`Use row and column level security`,
  },
  {
    id: "connection-impersonation",
    icon: "corner_up_right",
    title: t`Connection impersonation`,
    description: t`All data is stored in the same database, but Metabase will use a different database role to connect for each tenant. Roles are configured at the database level to only query relevant data.`,
    confirmText: t`Use connection impersonation`,
  },
  {
    id: "database-routing",
    icon: "database_routing",
    title: t`Database routing`,
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
    <Stack gap="md">
      <Radio.Group
        value={value}
        onChange={(nextValue) => onChange(nextValue as DataSegregationStrategy)}
      >
        <Stack gap="md">
          {options.map((strategy) => (
            <Radio.Card
              key={strategy.id}
              value={strategy.id}
              radius="md"
              p="md"
              className={S.radioCard}
              data-testid={`strategy-card-${strategy.id}`}
            >
              <Group wrap="nowrap" align="flex-start">
                <Icon
                  name={strategy.icon}
                  className={S.cardIcon}
                  w={24}
                  h={24}
                />

                <div>
                  <Text fw="bold" size="md" className={S.radioCardTitle}>
                    {strategy.title}
                  </Text>

                  <Text size="sm" c="text-secondary" lh="lg">
                    {strategy.description}
                  </Text>
                </div>
              </Group>
            </Radio.Card>
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
