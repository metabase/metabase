import { useMemo, useCallback } from "react";
import * as React from "react";

type Options = {
  preventDefault?: boolean;
};

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
  preventDefault?: boolean;
};

// Prevent DOM events from bubbling through the React component tree
// This is useful for modals and popovers as they are often targeted to
// interactive elements.
function EventSandbox({
  children,
  disabled,
  enableMouseEvents = false,
  preventDefault = false,
}: EventSandboxProps) {
  const stop = useCallback(
    (event: React.SyntheticEvent) => {
      _stop(event, { preventDefault });
    },
    [preventDefault],
  );

  const extraProps = useMemo(() => {
    const mouseEventBlockers = {
      onMouseDown: stop,
      onMouseEnter: stop,
      onMouseLeave: stop,
      onMouseMove: stop,
      onMouseOver: stop,
      onMouseOut: stop,
      onMouseUp: stop,
    };

    return enableMouseEvents ? {} : mouseEventBlockers;
  }, [stop, enableMouseEvents]);

  return disabled === true ? (
    <React.Fragment>{children}</React.Fragment>
  ) : (
    <div
      onClick={stop}
      onContextMenu={stop}
      onDoubleClick={stop}
      onDrag={stop}
      onDragEnd={stop}
      onDragEnter={stop}
      onDragExit={stop}
      onDragLeave={stop}
      onDragOver={stop}
      onDragStart={stop}
      onDrop={stop}
      onKeyDown={stop}
      onKeyPress={stop}
      onKeyUp={stop}
      onFocus={stop}
      onBlur={stop}
      onChange={stop}
      onInput={stop}
      onInvalid={stop}
      onSubmit={stop}
      {...extraProps}
    >
      {children}
    </div>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default EventSandbox;
