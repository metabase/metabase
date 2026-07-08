import { type ReactNode, useRef, useState } from "react";

interface UseActionButtonLabelProps {
  defaultLabel: string | ReactNode;
  timeout?: number;
}

/**
 * Small hook to temporarily update a string, and return it to its
 * initial value after the timeout expires.
 */

export const useActionButtonLabel = ({
  defaultLabel,
  timeout = 3000,
}: UseActionButtonLabelProps) => {
  const [label, setLabel] = useState(defaultLabel);
  const timeoutId = useRef<number>();

  const handleUpdateLabel = (newLabel: string) => {
    clearTimeout(timeoutId.current);
    setLabel(newLabel);

    timeoutId.current = window.setTimeout(() => {
      setLabel(defaultLabel);
    }, timeout);
  };

  return {
    label,
    setLabel: handleUpdateLabel,
  };
};
