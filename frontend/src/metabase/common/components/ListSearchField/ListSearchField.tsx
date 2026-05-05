import { useEffect, useRef } from "react";

import { ActionIcon, Icon, TextInput, type TextInputProps } from "metabase/ui";

export function ListSearchField({
  autoFocus,
  onResetClick,
  ...props
}: TextInputProps & { onResetClick?: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // this component is used within virtualized lists
    // rerendering an input with autoFocus causes the list to be scrolled to the top
    // so we override an autoFocus prop here to prevent any scrolling
    if (inputRef.current && autoFocus) {
      inputRef.current.focus({
        preventScroll: true,
      });
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <TextInput
      data-testid="list-search-field"
      ref={inputRef}
      leftSection={<Icon name="search" />}
      rightSection={
        onResetClick && props.value ? (
          <ActionIcon onClick={onResetClick}>
            <Icon name="close" />
          </ActionIcon>
        ) : null
      }
      {...props}
    />
  );
}
