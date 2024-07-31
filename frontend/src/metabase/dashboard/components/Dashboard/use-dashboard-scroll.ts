import { useEffect, useState } from "react";

import { getMainElement } from "metabase/lib/dom";

export const useDashboardScroll = ({
  isInitialized,
  isSdk,
}: {
  isInitialized: boolean;
  isSdk?: boolean;
}) => {
  const mainElement = !isSdk ? getMainElement() : undefined;
  const [hasScroll, setHasScroll] = useState(
    mainElement ? mainElement.scrollTop > 0 : false,
  );

  useEffect(() => {
    if (!isInitialized) {
      return;
    }

    const node = getMainElement();

    const handleScroll = (event: any) => {
      setHasScroll(event.target.scrollTop > 0);
    };

    node?.addEventListener("scroll", handleScroll, { passive: true });

    return () => node?.removeEventListener("scroll", handleScroll);
  }, [isInitialized]);

  return hasScroll;
};
