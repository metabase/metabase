import {
  type ReactNode,
  type Ref,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
import { useLatest } from "react-use";
import { match } from "ts-pattern";

import { Box, Combobox, Flex, Icon, Text, useCombobox } from "metabase/ui";
import type { IconName } from "metabase-types/api";

import S from "./SuggestionList.module.css";
import {
  type SuggestionGroup,
  type SuggestionRow,
  getOptions,
  getVisibleGroups,
} from "./utils";

export type ListKeys = (event: KeyboardEvent) => boolean;

type GroupHeaderProps = {
  value: string;
  label: string;
  icon: IconName;
  isCollapsed: boolean;
  onHover: () => void;
};

const GroupHeader = ({
  value,
  label,
  icon,
  isCollapsed,
  onHover,
}: GroupHeaderProps) => (
  <Combobox.Option
    value={value}
    mb={isCollapsed ? 0 : "sm"}
    aria-expanded={!isCollapsed}
    onMouseEnter={onHover}
  >
    <Flex align="center" gap="sm" flex={1}>
      <Icon name={icon} className={S.groupIcon} />
      <Text fw="bold" c="inherit" flex={1}>
        {label}
      </Text>
      <Icon name={isCollapsed ? "chevronright" : "chevrondown"} size={12} />
    </Flex>
  </Combobox.Option>
);

type GroupRowProps<T> = {
  row: SuggestionRow<T>;
  onHover: () => void;
};

const GroupRow = <T,>({ row, onHover }: GroupRowProps<T>) =>
  match(row)
    .with({ type: "label" }, ({ label }) => (
      <Text size="sm" c="text-secondary" px="sm" py="xs">
        {label}
      </Text>
    ))
    .with({ type: "item" }, ({ key, label, icon, hint }) => (
      <Combobox.Option value={key} onMouseEnter={onHover}>
        <Flex align="center" gap="sm" flex={1}>
          {icon && <Icon name={icon} />}
          <Text c="inherit" flex={1}>
            {label}
          </Text>
          {hint && <Text className={S.hint}>{hint}</Text>}
        </Flex>
      </Combobox.Option>
    ))
    .exhaustive();

type SuggestionListProps<T> = {
  groups: readonly SuggestionGroup<T>[];
  query: string;
  exact: T | null;
  keys: Ref<ListKeys>;
  footer?: ReactNode;
  onPick: (value: T) => void;
};

export const SuggestionList = <T,>({
  groups,
  query,
  exact,
  keys,
  footer,
  onPick,
}: SuggestionListProps<T>) => {
  const store = useCombobox();
  const [collapsedKeys, setCollapsedKeys] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const visibleGroups = getVisibleGroups(groups, collapsedKeys, query);
  const options = getOptions(visibleGroups);
  const optionsRef = useLatest(options);

  const selectByKey = (key: string) =>
    store.selectOption(options.findIndex((option) => option.key === key));

  const toggle = (key: string) => {
    const next = new Set(collapsedKeys);
    if (!next.delete(key)) {
      next.add(key);
    }
    setCollapsedKeys(next);
  };

  const submit = (key: string) => {
    const option = options.find((option) => option.key === key);
    if (option?.type === "header") {
      toggle(option.key);
    }
    if (option?.type === "item") {
      onPick(option.value);
    }
  };

  const pickSelected = () => {
    const hasSelected = store.getSelectedOptionIndex() >= 0;
    store.clickSelectedOption();
    return hasSelected;
  };

  const pickExact = () => {
    if (exact === null) {
      return false;
    }
    onPick(exact);
    return true;
  };

  const move = (select: () => unknown) => {
    select();
    return true;
  };

  const { selectOption, resetSelectedOption } = store;
  useEffect(() => {
    const firstItemIndex = optionsRef.current.findIndex(
      ({ type }) => type === "item",
    );
    if (firstItemIndex < 0) {
      resetSelectedOption();
      return;
    }
    selectOption(firstItemIndex);
  }, [selectOption, resetSelectedOption, query, groups, optionsRef]);

  useImperativeHandle(
    keys,
    () => (event: KeyboardEvent) =>
      match(event.key)
        .with("ArrowDown", () => move(store.selectNextOption))
        .with("ArrowUp", () => move(store.selectPreviousOption))
        .with("Enter", pickSelected)
        .with("Tab", () => !event.shiftKey && pickSelected())
        .with(" ", pickExact)
        .otherwise(() => false),
  );

  return (
    <Combobox
      store={store}
      classNames={{ option: S.option }}
      onOptionSubmit={submit}
    >
      <Box
        className={S.list}
        w="20rem"
        mah="25rem"
        onMouseDownCapture={(event) => event.preventDefault()}
      >
        <Combobox.Options className={S.items} p={0}>
          {visibleGroups.map((group) => {
            const isOpenWithHeader =
              Boolean(group.header) && !group.isCollapsed;
            return (
              <Combobox.Group
                key={group.key}
                px="lg"
                pt="md"
                pb={isOpenWithHeader ? "xl" : "md"}
              >
                {group.header && (
                  <GroupHeader
                    value={group.key}
                    label={group.header.label}
                    icon={group.header.icon}
                    isCollapsed={group.isCollapsed}
                    onHover={() => selectByKey(group.key)}
                  />
                )}
                {group.rows.map((row) => (
                  <GroupRow
                    key={row.key}
                    row={row}
                    onHover={() => selectByKey(row.key)}
                  />
                ))}
              </Combobox.Group>
            );
          })}
        </Combobox.Options>
        {footer && <Box className={S.footer}>{footer}</Box>}
      </Box>
    </Combobox>
  );
};
