import { useEffect } from "react";

import type { EmbeddingHashOptions } from "metabase/embedding/types";
import { useDispatch } from "metabase/redux";
import { setOptions } from "metabase/redux/embed";
import type { Location } from "metabase/router";
import { parseHashOptions } from "metabase/utils/browser";

export const useSetEmbedFont = ({ location }: { location: Location }) => {
  const dispatch = useDispatch();

  useEffect(() => {
    // Unjustified type cast. FIXME
    const { font } = parseHashOptions(location.hash) as EmbeddingHashOptions;

    dispatch(
      setOptions({
        font: font ?? undefined,
      }),
    );
  }, [location.hash, dispatch]);
};
