import React, { useRef, useEffect } from "react";

import Icon from "metabase/components/Icon";
import TextInput from "metabase/components/TextInput";

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
    <TextInput
      ref={inputRef}
      {...props}
      padding="sm"
      borderRadius="md"
      icon={<Icon name="search" size={16} />}
    />
  );
}

ListSearchField.propTypes = TextInput.propTypes;
