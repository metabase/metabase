import { useMemo, useCallback } from "react";
import * as React from "react";
import _ from "underscore";

type Options = {
  preventDefault?: boolean;
};

type SandboxedEvents =
  | "onBlur"
  | "onChange"
  | "onClick"
  | "onContextMenu"
  | "onDoubleClick"
  | "onDrag"
  | "onDragEnd"
  | "onDragEnter"
  | "onDragExit"
  | "onDragLeave"
  | "onDragOver"
  | "onDragStart"
  | "onDrop"
  | "onFocus"
  | "onInput"
  | "onInvalid"
  | "onKeyDown"
  | "onKeyPress"
  | "onKeyUp"
  | "onMouseDown"
  | "onMouseEnter"
  | "onMouseLeave"
  | "onMouseMove"
  | "onMouseOut"
  | "onMouseOver"
  | "onMouseUp"
  | "onSubmit";

function _stop<E extends React.SyntheticEvent>(
  event: E,
  { preventDefault }: Options,
) {
  event.stopPropagation();
  if (preventDefault) {
    event.preventDefault();
  }
}

type EventSandboxProps = {
  children: React.ReactNode;
  enableMouseEvents?: boolean;
  disabled?: boolean;
  unsandboxEvents?: SandboxedEvents[];
  preventDefault?: boolean;
  className?: string;
};

// Prevent DOM events from bubbling through the React component tree
// This is useful for modals and popovers as they are often targeted to
// interactive elements.
function EventSandbox({
  children,
  disabled,
  enableMouseEvents = false,
  preventDefault = false,
  unsandboxEvents = [],
  className,
}: EventSandboxProps) {
  const stop = useCallback(
    (event: React.SyntheticEvent) => {
      _stop(event, { preventDefault });
    },
    [preventDefault],
  );

  const baseProps = useMemo(() => {
    return _.omit(
      {
        onClick: stop,
        onContextMenu: stop,
        onDoubleClick: stop,
        onDrag: stop,
        onDragEnd: stop,
        onDragEnter: stop,
        onDragExit: stop,
        onDragLeave: stop,
        onDragOver: stop,
        onDragStart: stop,
        onDrop: stop,
        onKeyDown: stop,
        onKeyPress: stop,
        onKeyUp: stop,
        onFocus: stop,
        onBlur: stop,
        onChange: stop,
        onInput: stop,
        onInvalid: stop,
        onSubmit: stop,
      },
      unsandboxEvents,
    );
  }, [stop, unsandboxEvents]);

  const extraProps = useMemo(() => {
    const mouseEventBlockers = _.omit(
      {
        onMouseDown: stop,
        onMouseEnter: stop,
        onMouseLeave: stop,
        onMouseMove: stop,
        onMouseOver: stop,
        onMouseOut: stop,
        onMouseUp: stop,
      },
      unsandboxEvents,
    );

    return enableMouseEvents ? {} : mouseEventBlockers;
  }, [stop, enableMouseEvents, unsandboxEvents]);

  return disabled === true ? (
    <React.Fragment>{children}</React.Fragment>
  ) : (
    <div className={className} {...baseProps} {...extraProps}>
      {children}
    </div>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default EventSandbox;
