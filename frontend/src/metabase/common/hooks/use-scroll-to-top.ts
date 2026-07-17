import { type RefObject, useLayoutEffect, useRef } from "react";
import _ from "underscore";

type UseScrollToTopProps = {
  ref: RefObject<HTMLElement>;
  keys: unknown[];
  skip?: boolean;
};

/**
 * Scrolls the element back to the top when `keys` change, e.g. after
 * paginating or sorting.
 */
export function useScrollToTop({
  ref,
  keys,
  skip = false,
}: UseScrollToTopProps) {
  const keysRef = useRef(keys);
  const isResetPendingRef = useRef(false);

  if (!_.isEqual(keysRef.current, keys)) {
    keysRef.current = keys;
    isResetPendingRef.current = true;
  }

  useLayoutEffect(() => {
    if (!skip && isResetPendingRef.current) {
      isResetPendingRef.current = false;
      if (ref.current) {
        ref.current.scrollTop = 0;
      }
    }
  }, [ref, skip]);
}
