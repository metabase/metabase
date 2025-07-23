import { useEffect } from "react";

import { useSetting } from "metabase/common/hooks";

export const useFavicon = ({ favicon }: { favicon: string | null }) => {
  const defaultFavicon = useSetting("application-favicon-url");

  useEffect(() => {
    document
      .querySelector('link[rel="icon"]')
      ?.setAttribute("href", favicon ?? defaultFavicon);

    return () => {
      if (defaultFavicon) {
        document
          .querySelector('link[rel="icon"]')
          ?.setAttribute("href", defaultFavicon);
      }
    };
  }, [defaultFavicon, favicon]);
};
