import { useRef, useEffect } from "react";

import Input from "metabase/core/components/Input";

export default function ListSearchField({ autoFocus, ...props }) {
  const inputRef = useRef();

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
    <Input
      inputRef={inputRef}
      data-testid="list-search-field"
      {...props}
      leftIcon="search"
    />
  );
}

ListSearchField.propTypes = Input.propTypes;
