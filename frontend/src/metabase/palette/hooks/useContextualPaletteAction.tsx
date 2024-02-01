import { useEffect } from "react";
import type { JsonStructureItem } from "react-cmdk";
import { useDispatch } from "metabase/lib/redux";
import {
  registerPaletteAction,
  unregisterPaletteAction,
} from "metabase/redux/app";

export const useContextualPaletteAction = (
  paletteAction: JsonStructureItem | null,
) => {
  const dispatch = useDispatch();

  useEffect(() => {
    if (!paletteAction) {
      return;
    }
    dispatch(registerPaletteAction(paletteAction));
    return () => {
      dispatch(unregisterPaletteAction(paletteAction));
    };
  }, [dispatch, paletteAction]);
};
