import { useKBar, VisualState } from "kbar";
import * as React from "react";

import { color } from "metabase/lib/colors";
import { Flex, Text, TextInput, type TextInputProps } from "metabase/ui";

export const KBAR_LISTBOX = "kbar-listbox";
export const getListboxItemId = (id: number) => `kbar-listbox-item-${id}`;

export function PaletteInput(
  props: TextInputProps & {
    defaultPlaceholder?: string;
  },
) {
  const {
    query,
    search,
    actions,
    currentRootActionId,
    activeIndex,
    showing,
    options,
  } = useKBar(state => ({
    search: state.searchQuery,
    currentRootActionId: state.currentRootActionId,
    actions: state.actions,
    activeIndex: state.activeIndex,
    showing: state.visualState === VisualState.showing,
  }));

  const [inputValue, setInputValue] = React.useState(search);
  React.useEffect(() => {
    query.setSearch(inputValue);
  }, [inputValue, query]);

  const { defaultPlaceholder, ...rest } = props;

  React.useEffect(() => {
    query.setSearch("");
    query.getInput().focus();
    setInputValue("");
    return () => query.setSearch("");
  }, [currentRootActionId, query]);

  const parentActionName = React.useMemo((): string => {
    return currentRootActionId && actions[currentRootActionId]
      ? actions[currentRootActionId].name
      : "";
  }, [actions, currentRootActionId]);

  const placeholder = React.useMemo((): string => {
    const defaultText = defaultPlaceholder ?? "Type a command or search…";
    return parentActionName ? "" : defaultText;
  }, [parentActionName, defaultPlaceholder]);

  return (
    <Flex
      align="center"
      p="0.75rem"
      w="100%"
      bg={"bg-light"}
      lh="1rem"
      style={{
        border: `1px solid ${color("border")}`,
        color: color("text-dark"),
        borderRadius: "0.5rem",
      }}
    >
      {parentActionName ? (
        <Text
          component="span"
          c="text-light"
          fw="bold"
          lh="inherit"
          mr="0.25rem"
        >
          {`${parentActionName} / `}
        </Text>
      ) : null}
      <TextInput
        {...rest}
        ref={query.inputRefSetter}
        autoFocus
        autoComplete="off"
        role="combobox"
        spellCheck="false"
        aria-expanded={showing}
        aria-controls={KBAR_LISTBOX}
        aria-activedescendant={getListboxItemId(activeIndex)}
        value={inputValue}
        placeholder={placeholder}
        onChange={event => {
          props.onChange?.(event);
          setInputValue(event.target.value);
          options?.callbacks?.onQueryChange?.(event.target.value);
        }}
        onKeyDown={event => {
          props.onKeyDown?.(event);
          if (currentRootActionId && !search && event.key === "Backspace") {
            const parent = actions[currentRootActionId].parent;
            query.setCurrentRootAction(parent);
          }
        }}
        styles={{
          input: {
            border: "none",
            padding: 0,
            lineHeight: "1rem",
            height: "auto",
            minHeight: "auto",
            fontWeight: "bold",
            background: "inherit",
          },
          root: {
            flexGrow: 1,
          },
        }}
      />
    </Flex>
  );
}
