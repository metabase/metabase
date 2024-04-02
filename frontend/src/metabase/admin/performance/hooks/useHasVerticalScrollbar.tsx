import { useEffect, useRef, useState } from "react";

export const useHasVerticalScrollbar = () => {
  const [hasVerticalScrollbar, setHasVerticalScrollbar] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const el = ref.current;
  useEffect(() => {
    if (el) {
      setHasVerticalScrollbar(el.scrollHeight > el.clientHeight);
    }
  }, [el?.scrollHeight, el?.clientHeight, el, setHasVerticalScrollbar]);
  return { hasVerticalScrollbar, ref };
};
