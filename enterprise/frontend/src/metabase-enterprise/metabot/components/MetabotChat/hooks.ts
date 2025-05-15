import { type RefObject, useEffect, useState } from "react";

export const useIsScrollable = <Ref extends RefObject<HTMLElement>>(
  ref: Ref,
) => {
  const [isScrollable, setIsScrollable] = useState(false);

  const setScrollability = (el: HTMLElement) =>
    setIsScrollable(el.scrollHeight > el.clientHeight);

  useEffect(() => {
    const elem = ref.current;
    if (!elem) {
      return;
    }

    setScrollability(elem);

    const resizeObserver = new ResizeObserver(() => setScrollability(elem));
    resizeObserver.observe(elem);

    const mutationObserver = new MutationObserver(() => setScrollability(elem));
    mutationObserver.observe(elem, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [ref]);

  return isScrollable;
};
