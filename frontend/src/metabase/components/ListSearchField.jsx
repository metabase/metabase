import React, { useEffect, useRef } from "react";

import Icon from "metabase/components/Icon";
import TextInput from "metabase/components/TextInput";

export default function ListSearchField(props) {
  const inputRef = useRef();

  useEffect(() => {
    if (!props.autoFocus) {
      return;
    }

    // Call focus() with a small delay because instant input focus causes an abrupt scroll to top of page
    // when ListSearchField is used inside a popover. It seems that it takes a while for Tether library
    // to correctly position the popover.
    const timerId = setTimeout(
      () => inputRef.current && inputRef.current.focus(),
      50,
    );
    return () => clearTimeout(timerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <TextInput
      {...props}
      ref={inputRef}
      padding="sm"
      borderRadius="md"
      icon={<Icon name="search" size={16} />}
    />
  );
}

ListSearchField.propTypes = TextInput.propTypes;
