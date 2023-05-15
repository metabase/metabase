import React from "react";

import Icon from "metabase/components/Icon";

type Props = {
  isFullscreen: boolean;
  hasValue: boolean;
  noReset: boolean;
  noPopover: boolean;
  isFocused: boolean;
  setValue: (value: any) => void;
};

function WidgetStatusIcon({
  isFullscreen,
  hasValue,
  noReset,
  noPopover,
  isFocused,
  setValue,
}: Props) {
  if (isFullscreen) {
    return null;
  }

  if (hasValue && !noReset) {
    return (
      <Icon
        name="close"
        className="flex-align-right cursor-pointer flex-no-shrink"
        size={12}
        onClick={e => {
          if (hasValue) {
            e.stopPropagation();
            setValue(null);
          }
        }}
      />
    );
  } else if (noPopover && isFocused) {
    return (
      <Icon
        name="enter_or_return"
        className="flex-align-right flex-no-shrink"
        size={12}
      />
    );
  } else if (noPopover) {
    return (
      <Icon
        name="empty"
        className="flex-align-right cursor-pointer flex-no-shrink"
        size={12}
      />
    );
  } else if (!noPopover) {
    return (
      <Icon
        name="chevrondown"
        className="flex-align-right flex-no-shrink"
        size={12}
      />
    );
  }

  return null;
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default WidgetStatusIcon;
