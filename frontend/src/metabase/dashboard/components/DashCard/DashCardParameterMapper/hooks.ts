import { useEffect } from "react";
import { usePrevious } from "react-use";

import { resetParameterMapping } from "metabase/dashboard/actions/parameters";
import { useDispatch } from "metabase/lib/redux";
import { getParameterSubType } from "metabase-lib/v1/parameters/utils/parameter-type";
import type { DashCardId, Parameter } from "metabase-types/api";

export function useResetParameterMapping({
  editingParameter,
  isNative,
  dashcardId,
}: {
  editingParameter: Parameter | null | undefined;
  isNative: boolean;
  dashcardId: DashCardId;
}) {
  const prevParameter = usePrevious(editingParameter);
  const dispatch = useDispatch();

  useEffect(() => {
    if (!prevParameter || !editingParameter) {
      return;
    }

    if (isNative && prevParameter.type !== editingParameter.type) {
      const subType = getParameterSubType(editingParameter);
      const prevSubType = getParameterSubType(prevParameter);

      if (prevSubType === "=" && subType !== "=") {
        dispatch(resetParameterMapping(editingParameter.id, dashcardId));
      }
    }
  }, [isNative, prevParameter, editingParameter, dispatch, dashcardId]);
}
