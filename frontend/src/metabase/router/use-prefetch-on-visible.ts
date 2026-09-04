import { useEffect, useState } from "react";

import { observeLinkForPrefetch } from "./prefetch";

/**
 * Watch a link so its target starts loading when it comes into view.
 *
 * Returns a ref callback. Pass `null` for a link with no target, or one that
 * should not be watched.
 *
 * The element is held in state rather than a ref so the effect runs when the
 * node mounts, which a ref alone would not trigger.
 */
export function usePrefetchOnVisible(path: string | null) {
  const [element, setElement] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (element == null || path == null) {
      return;
    }

    return observeLinkForPrefetch(element, path);
  }, [element, path]);

  return setElement;
}
