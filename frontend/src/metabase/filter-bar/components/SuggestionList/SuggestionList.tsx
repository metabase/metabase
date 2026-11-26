import {
  type ReactNode,
  type Ref,
  useEffect,
  useImperativeHandle,
} from "react";
import { match } from "ts-pattern";

import { Box, Combobox, type ComboboxStore } from "metabase/ui";

import S from "./SuggestionList.module.css";

export type ListKeys = (event: KeyboardEvent) => boolean;

type SuggestionListProps = {
  store: ComboboxStore;
  footer?: ReactNode;
  children: ReactNode;
  onSubmit: (value: string) => void;
};

export const SuggestionList = ({
  store,
  footer,
  children,
  onSubmit,
}: SuggestionListProps) => (
  <Combobox
    store={store}
    classNames={{ option: S.option }}
    onOptionSubmit={onSubmit}
  >
    <Box
      className={S.list}
      w="20rem"
      mah="25rem"
      onMouseDownCapture={(event) => event.preventDefault()}
    >
      <Combobox.Options className={S.items} p={0}>
        {children}
      </Combobox.Options>
      {footer && <Box className={S.footer}>{footer}</Box>}
    </Box>
  </Combobox>
);

type SuggestionSectionProps = {
  isExpandedGroup?: boolean;
  children: ReactNode;
};

export const SuggestionSection = ({
  isExpandedGroup = false,
  children,
}: SuggestionSectionProps) => (
  <Box className={S.section} px="lg" pt="md" pb={isExpandedGroup ? "xl" : "md"}>
    {children}
  </Box>
);

type ListKeysOptions = {
  keys: Ref<ListKeys>;
  store: ComboboxStore;
  query: string;
  firstIndex: number;
  pickExact: () => boolean;
};

export const useListKeys = ({
  keys,
  store,
  query,
  firstIndex,
  pickExact,
}: ListKeysOptions) => {
  useEffect(() => {
    if (firstIndex < 0) {
      store.resetSelectedOption();
      return;
    }
    store.selectOption(firstIndex);
  }, [store, query, firstIndex]);

  const move = (select: () => unknown) => {
    select();
    return true;
  };

  const submit = () => {
    const hasSelected = store.getSelectedOptionIndex() >= 0;
    store.clickSelectedOption();
    return hasSelected;
  };

  useImperativeHandle(
    keys,
    () => (event: KeyboardEvent) =>
      match(event.key)
        .with("ArrowDown", () => move(store.selectNextOption))
        .with("ArrowUp", () => move(store.selectPreviousOption))
        .with("Enter", submit)
        .with("Tab", () => !event.shiftKey && submit())
        .with(" ", pickExact)
        .otherwise(() => false),
  );
};
