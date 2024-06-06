import { useCallback, useEffect } from "react";

import type { EmbedFont } from "metabase/dashboard/types";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { setOptions } from "metabase/redux/embed";
import { getFont } from "metabase/styled-components/selectors";

export const useEmbedFont = () => {
  const font = useSelector(getFont);

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
    setFont(font);
  }, [font, setFont]);

  return { font, setFont };
};
