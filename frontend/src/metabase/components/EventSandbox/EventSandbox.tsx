import { useMemo, useCallback } from "react";
import * as React from "react";
import _ from "underscore";
type Options = {
  preventDefault?: boolean;
};

type DivProps = React.HTMLAttributes<HTMLDivElement>;

/** A name of an event that can fire on an HTMLDivElement, such as "onClick" or "onMouseUp" */
type EventName = Exclude<
  {
    [K in keyof DivProps]: K extends `on${string}` ? K : never;
  }[keyof DivProps],
  undefined
>;

function _stop<E extends React.SyntheticEvent>(
  event: E,
  { preventDefault }: Options,
) {
  event.stopPropagation();
  if (preventDefault) {
    event.preventDefault();
  }
}

export type EventSandboxProps = {
  children: React.ReactNode;
  disabled?: boolean;
  /** Explicitly specify which events are sandboxed. By default all events are sandboxed */
  sandboxedEvents?: EventName[];
  /** Explicitly specify which events are *not* sandboxed. By default, all events are sandboxed, minus the ones mentioned here */
  unsandboxedEvents?: EventName[];
  preventDefault?: boolean;
  className?: string;
  /** Do not sandbox the 'onMouse*' events. (NOTE: This does not include onClick.)*/
  enableMouseEvents?: boolean;
  /** Do not sandbox the 'onKey*' events */
  enableKeyEvents?: boolean;
};

const eventsSandboxedByDefault: EventName[] = [
  "onClick",
  "onContextMenu",
  "onDoubleClick",
  "onDrag",
  "onDragEnd",
  "onDragEnter",
  "onDragExit",
  "onDragLeave",
  "onDragOver",
  "onDragStart",
  "onDrop",
  "onKeyDown",
  "onKeyPress",
  "onKeyUp",
  "onFocus",
  "onBlur",
  "onChange",
  "onInput",
  "onInvalid",
  "onSubmit",
  "onMouseDown",
  "onMouseEnter",
  "onMouseLeave",
  "onMouseMove",
  "onMouseOver",
  "onMouseOut",
  "onMouseUp",
];

/** All supported events that start with 'onMouse' */
const allOnMouseEvents = eventsSandboxedByDefault.filter(name =>
  name.startsWith("onMouse"),
);

/** All supported events that start with 'onKey' */
const allOnKeyEvents = eventsSandboxedByDefault.filter(name =>
  name.startsWith("onKey"),
);

/** Prevent DOM events from bubbling through the React component tree.
 *
 * This is useful for modals and popovers as they are often targeted to interactive elements. */
function EventSandbox({
  children,
  disabled,
  sandboxedEvents = eventsSandboxedByDefault,
  unsandboxedEvents = [],
  enableMouseEvents = false,
  enableKeyEvents = false,
  preventDefault = false,
  className,
}: EventSandboxProps) {
  const stop = useCallback(
    (event: React.SyntheticEvent) => {
      _stop(event, { preventDefault });
    },
    [preventDefault],
  );

  const sandboxProps = useMemo(() => {
    const allUnsandboxedEvents = unsandboxedEvents
      .concat(enableMouseEvents ? allOnMouseEvents : [])
      .concat(enableKeyEvents ? allOnKeyEvents : []);

    const sandboxedEventNames = _.difference(
      sandboxedEvents,
      allUnsandboxedEvents,
    );

    const entries = sandboxedEventNames.map<[EventName, typeof stop]>(name => [
      name,
      stop,
    ]);
    return Object.fromEntries(entries);
  }, [
    stop,
    sandboxedEvents,
    unsandboxedEvents,
    enableMouseEvents,
    enableKeyEvents,
  ]);

  return disabled === true ? (
    <React.Fragment>{children}</React.Fragment>
  ) : (
    <div className={className} {...sandboxProps}>
      {children}
    </div>
  );
}
// eslint-disable-next-line import/no-default-export -- deprecated usage
export default EventSandbox;
