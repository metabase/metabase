import { useEffect, useRef } from "react";

import { ActionIcon, Icon, TextInput, type TextInputProps } from "metabase/ui";

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default function ListSearchField({
  autoFocus,
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
      icon={<Icon name="search" />}
      rightSection={
        props.onResetClick && props.value ? (
          <ActionIcon onClick={props.onResetClick}>
            <Icon name="close" />
          </ActionIcon>
        ) : null
      }
      {...props}
    />
  );
}
