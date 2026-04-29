import type { Location } from "history";
import { useEffect } from "react";

import type { EmbeddingHashOptions } from "metabase/public/lib/types";
import { useDispatch } from "metabase/redux";
import { setOptions } from "metabase/redux/embed";
import { parseHashOptions } from "metabase/utils/browser";

export const useSetEmbedFont = ({ location }: { location: Location }) => {
  const dispatch = useDispatch();

  useEffect(() => {
    const { font } = parseHashOptions(location.hash) as EmbeddingHashOptions;

    dispatch(
      setOptions({
        font: font ?? undefined,
      }),
    );
  }, [location.hash, dispatch]);
};
