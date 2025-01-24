import type { Location } from "history";
import { useEffect } from "react";

import { parseHashOptions } from "metabase/lib/browser";
import { useDispatch } from "metabase/lib/redux";
import type { EmbeddingDisplayOptions } from "metabase/public/lib/types";
import { setOptions } from "metabase/redux/embed";

export const useSetEmbedFont = ({ location }: { location: Location }) => {
  const dispatch = useDispatch();

  useEffect(() => {
    const { font } = parseHashOptions(location.hash) as EmbeddingDisplayOptions;

    dispatch(
      setOptions({
        font: font ?? undefined,
      }),
    );
  }, [location.hash, dispatch]);
};
