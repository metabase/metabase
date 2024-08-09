import { useEffect, useState } from "react";

import { isEmbeddingSdk } from "metabase/env";
import { getMainElement } from "metabase/lib/dom";

export const useHasDashboardScroll = ({
  isInitialized,
}: {
  isInitialized: boolean;
}) => {
  const mainElement = !isEmbeddingSdk ? getMainElement() : undefined;
  const [hasScroll, setHasScroll] = useState(
    mainElement ? mainElement.scrollTop > 0 : false,
  );

  useEffect(() => {
    if (!isInitialized) {
      return;
    }

    const node = !isEmbeddingSdk ? getMainElement() : undefined;

    const handleScroll = (event: any) => {
      setHasScroll(event.target.scrollTop > 0);
    };

    node?.addEventListener("scroll", handleScroll, { passive: true });

    return () => node?.removeEventListener("scroll", handleScroll);
  }, [isInitialized]);

  return hasScroll;
};
