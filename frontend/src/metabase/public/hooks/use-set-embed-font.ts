import type { Location } from "history";
import { useEffect } from "react";

import { parseHashOptions } from "metabase/utils/browser";
import { useDispatch } from "metabase/utils/redux";
import type { EmbeddingHashOptions } from "metabase/public/lib/types";
import { setOptions } from "metabase/redux/embed";

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
