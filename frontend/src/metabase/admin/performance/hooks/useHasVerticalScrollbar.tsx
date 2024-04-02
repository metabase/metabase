import { useEffect, useRef, useState } from "react";

export const useHasVerticalScrollbar = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [hasVerticalScrollbar, setHasVerticalScrollbar] = useState(false);

  const el = ref.current;
  useEffect(() => {
    if (el) {
      setHasVerticalScrollbar(el.scrollHeight > el.clientHeight);
    }
  }, [el?.scrollHeight, el?.clientHeight, el, setHasVerticalScrollbar]);
  return { hasVerticalScrollbar, ref };
};
