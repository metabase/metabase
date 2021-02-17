import React from "react";
import ReactDOM from "react-dom";

function stop(event) {
  event.stopPropagation();
}

// Prevent DOM events from bubbling through the React component tree
// See https://reactjs.org/docs/portals.html#event-bubbling-through-portals
function SandboxedPortal({ children, container }) {
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
      onMouseDown={stop}
      onMouseEnter={stop}
      onMouseLeave={stop}
      onMouseMove={stop}
      onMouseOver={stop}
      onMouseOut={stop}
      onMouseUp={stop}
      onKeyDown={stop}
      onKeyPress={stop}
      onKeyUp={stop}
      onFocus={stop}
      onBlur={stop}
      onChange={stop}
      onInput={stop}
      onInvalid={stop}
      onSubmit={stop}
    >
      {children}
    </div>,
    container,
  );
}

export default SandboxedPortal;
