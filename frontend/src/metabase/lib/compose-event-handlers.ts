type HandlerType<E> = ((event: E) => void) | undefined;

// Dummy comment
export const composeEventHandlers = <E>(...handlers: HandlerType<E>[]) => {
  return function handleEvent(event: E) {
    handlers.forEach(handler => {
      if (typeof handler === "function") {
        handler(event);
      }
    });
  };
};
