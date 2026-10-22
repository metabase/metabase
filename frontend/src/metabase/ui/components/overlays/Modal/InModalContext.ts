import { createContext, useContext } from "react";

const InModalContext = createContext(false);

/**
 * Overrides `useIsInModal` for its children. `Modal` and `Modal.Root` provide
 * `true`; pass `false` for modal content that should keep its page layout.
 */
export const InModalProvider = InModalContext.Provider;

/** Whether the component renders inside a `Modal` or `Modal.Root`. */
export const useIsInModal = () => useContext(InModalContext);
