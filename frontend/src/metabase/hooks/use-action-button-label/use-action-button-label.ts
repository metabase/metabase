import { type ReactNode, useRef, useState } from "react";

interface UseActionButtonLabelProps {
  defaultLabel: string | ReactNode;
  timeout?: number;
}

export const useActionButtonLabel = ({
  defaultLabel,
  timeout = 3000,
}: UseActionButtonLabelProps) => {
  const [label, setLabel] = useState(defaultLabel);
  const timeoutId = useRef<NodeJS.Timeout>();

  const handleUpdateLabel = (newLabel: string) => {
    clearTimeout(timeoutId.current);
    setLabel(newLabel);

    timeoutId.current = setTimeout(() => {
      setLabel(defaultLabel);
    }, timeout);
  };

  return {
    label,
    setLabel: handleUpdateLabel,
  };
};
