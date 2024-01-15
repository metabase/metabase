import { Icon } from "metabase/ui";

type Props = {
  isFullscreen: boolean;
  hasValue: boolean;
  noPopover: boolean;
  isFocused: boolean;
  setValue: (value: any) => void;
};

export function WidgetStatusIcon({
  isFullscreen,
  hasValue,
  noPopover,
  isFocused,
  setValue,
}: Props) {
  if (isFullscreen) {
    return null;
  }

  if (hasValue) {
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
