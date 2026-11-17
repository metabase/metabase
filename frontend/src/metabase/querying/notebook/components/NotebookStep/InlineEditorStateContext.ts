import { createContext, useContext, useEffect } from "react";

/**
 * Lets a step tell its notebook step that its inline expression editor is
 * open. The editor has its own preview, so the step hides its preview then.
 */
export const InlineEditorStateContext = createContext<
  (isOpen: boolean) => void
>(() => {});

export function useReportInlineEditorOpen(isOpen: boolean) {
  const setIsOpen = useContext(InlineEditorStateContext);
  useEffect(() => {
    setIsOpen(isOpen);
    return () => setIsOpen(false);
  }, [isOpen, setIsOpen]);
}
