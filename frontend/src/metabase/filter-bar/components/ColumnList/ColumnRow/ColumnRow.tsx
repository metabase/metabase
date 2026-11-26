import { match } from "ts-pattern";

import { Combobox, Flex, Icon, Text } from "metabase/ui";

import { type ListRow, getItemDisplay } from "../utils";

type ColumnRowProps<F> = {
  row: ListRow<F>;
  onHover: () => void;
};

export const ColumnRow = <F,>({ row, onHover }: ColumnRowProps<F>) =>
  match(row)
    .with({ type: "group" }, ({ key, group, isCollapsed }) => (
      <Combobox.Option
        value={key}
        mb={isCollapsed ? 0 : "sm"}
        aria-expanded={!isCollapsed}
        onMouseEnter={onHover}
      >
        <Flex align="center" gap="sm">
          <Icon name={group.icon} c="icon-brand" />
          <Text fw="bold" c="inherit" flex={1}>
            {group.label}
          </Text>
          <Icon name={isCollapsed ? "chevronright" : "chevrondown"} size={12} />
        </Flex>
      </Combobox.Option>
    ))
    .with({ type: "section" }, ({ label }) => (
      <Text size="sm" c="text-secondary" px="sm" py="xs">
        {label}
      </Text>
    ))
    .with({ type: "item" }, ({ key, item }) => (
      <Combobox.Option value={key} onMouseEnter={onHover}>
        <Flex align="center" gap="sm">
          <Icon name={getItemDisplay(item).icon} />
          <Text c="inherit">{getItemDisplay(item).label}</Text>
        </Flex>
      </Combobox.Option>
    ))
    .exhaustive();
