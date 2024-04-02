import { useLayoutEffect, useRef, useState } from "react";

export const useVerticallyOverflows = () => {
  const [verticallyOverflows, setVerticallyOverflows] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const el = ref.current;
  useLayoutEffect(() => {
    if (el) {
      setVerticallyOverflows(el.scrollHeight > el.clientHeight);
    }
  }, [el?.scrollHeight, el?.clientHeight, el, setVerticallyOverflows]);
  return { verticallyOverflows, ref };
};
