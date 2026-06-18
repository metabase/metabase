export type OverlayStackContextStore = {
  subscribe: (listener: () => void) => () => void;
  getStack: () => string[];
  push: (id: string) => void;
  remove: (id: string) => void;
};

export const createOverlayStackStore = (): OverlayStackContextStore => {
  let stack: string[] = [];
  const listeners = new Set<() => void>();

  const emit = () => listeners.forEach((listener) => listener());

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getStack: () => stack,
    push: (id) => {
      stack = [...stack, id];
      emit();
    },
    remove: (id) => {
      stack = stack.filter((stackId) => stackId !== id);
      emit();
    },
  };
};
