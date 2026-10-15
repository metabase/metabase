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
 *
 * The scroll is deferred until `skip` is false.
 */
export function useScrollToTop({
  ref,
  keys,
  skip = false,
}: UseScrollToTopProps) {
  const previousKeysRef = useRef(keys);
  const keysVersionRef = useRef(0);
  const isResetPendingRef = useRef(false);

  if (!_.isEqual(previousKeysRef.current, keys)) {
    previousKeysRef.current = keys;
    keysVersionRef.current += 1;
    isResetPendingRef.current = true;
  }

  const keysVersion = keysVersionRef.current;
  useLayoutEffect(() => {
    if (!skip && isResetPendingRef.current) {
      isResetPendingRef.current = false;
      if (ref.current) {
        ref.current.scrollTop = 0;
      }
    }
  }, [ref, skip, keysVersion]);
}
