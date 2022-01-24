import React, { useMemo } from "react";

function stop<E extends React.SyntheticEvent>(event: E) {
  event.stopPropagation();
}

const mouseEventBlockers = {
  onMouseDown: stop,
  onMouseEnter: stop,
  onMouseLeave: stop,
  onMouseMove: stop,
  onMouseOver: stop,
  onMouseOut: stop,
  onMouseUp: stop,
};

type EventSandboxProps = {
  children: React.ReactNode;
  enableMouseEvents?: boolean;
  disabled?: boolean;
};

// Prevent DOM events from bubbling through the React component tree
// This is useful for modals and popovers as they are often targeted to
// interactive elements.
function EventSandbox({
  children,
  disabled,
  enableMouseEvents = false,
}: EventSandboxProps) {
  const extraProps = useMemo(() => {
    return enableMouseEvents ? {} : mouseEventBlockers;
  }, [enableMouseEvents]);

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

export default EventSandbox;
