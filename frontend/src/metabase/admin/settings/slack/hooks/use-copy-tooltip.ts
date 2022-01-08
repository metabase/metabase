import { MouseEvent, useCallback, useEffect, useState } from "react";

const DELAY = 3000;

export interface UseCopyTooltipResult {
  element: HTMLElement | undefined;
  handleClick: (event: MouseEvent<HTMLElement>) => void;
}

export const useCopyTooltip = (data: string): UseCopyTooltipResult => {
  const [element, setElement] = useState<HTMLElement>();

  useEffect(() => {
    if (element) {
      const timeout = setTimeout(() => setElement(undefined), DELAY);
      return () => clearTimeout(timeout);
    }
  }, [element]);

  const handleClick = useCallback((event: MouseEvent<HTMLElement>) => {
    navigator.clipboard.writeText(data);
    setElement(event.currentTarget);
  }, []);

  return { element, handleClick };
};
