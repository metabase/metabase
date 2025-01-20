import type { Location } from "history";
import { useCallback, useEffect } from "react";

import type {
  DashboardUrlHashOptions,
  EmbedFont,
} from "metabase/dashboard/types";
import { parseHashOptions } from "metabase/lib/browser";
import { useDispatch } from "metabase/lib/redux";
import { setOptions } from "metabase/redux/embed";

export const useSetEmbedFont = ({ location }: { location: Location }) => {
  const dispatch = useDispatch();
  const setFont = useCallback(
    (font: EmbedFont) => {
      dispatch(
        setOptions({
          font: font ?? undefined,
        }),
      );
    },
    [dispatch],
  );

  useEffect(() => {
    const { font } = parseHashOptions(location.hash) as DashboardUrlHashOptions;

    setFont(font ?? null);
  }, [location.hash, setFont]);

  return { setFont };
};
