import { useRef } from "react";

export const useHasVerticalScrollbar = () => {
  const ref = useRef<HTMLElement>(null);
  const el = ref.current;
  return {
    hasVerticalScrollbar: el ? el.scrollHeight > el.clientHeight : false,
    ref,
  };
};
