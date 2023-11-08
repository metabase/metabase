import React, { useMemo } from "react";
import ReactDOM from "react-dom";

function stop(event) {
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

// Prevent DOM events from bubbling through the React component tree
// See https://reactjs.org/docs/portals.html#event-bubbling-through-portals
function SandboxedPortal({ children, container, enableMouseEvents = false }) {
  const extraProps = useMemo(() => {
    return enableMouseEvents ? {} : mouseEventBlockers;
  }, [enableMouseEvents]);

  return ReactDOM.createPortal(
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
    </div>,
    container,
  );
}

export default SandboxedPortal;
