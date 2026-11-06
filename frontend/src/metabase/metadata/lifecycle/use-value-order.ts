import { useMemo } from "react";

import { skipToken, useGetFieldValuesQuery } from "metabase/api";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import type { Field } from "metabase-types/api";

import { useLifecycle } from "./lifecycle-store";
import {
  type OrderedValue,
  type ValueOrderInference,
  inferValueOrder,
  resolveValueOrder,
} from "./value-order";

export type ResolvedValueOrder = {
  /** The values in lifecycle order: an admin's, or else sync's guess */
  values: OrderedValue[];
  inference: ValueOrderInference;
  /** An admin set the order */
  isSaved: boolean;
  /** Shown as a guess to confirm: not saved, and lifecycle words matched */
  isInferred: boolean;
  isLoading: boolean;
};

/**
 * A column's values in lifecycle order, from its cached field values. The
 * field drawer edits it; a table's process reads it as its states.
 */
export function useValueOrder(field: Field | undefined): ResolvedValueOrder {
  const fieldId = field ? getRawTableFieldId(field) : undefined;
  const { getFieldLifecycle } = useLifecycle();
  const { data, isLoading } = useGetFieldValuesQuery(fieldId ?? skipToken);
  const saved = fieldId != null ? getFieldLifecycle(fieldId).values : undefined;

  const values = useMemo(
    () =>
      (data?.values ?? [])
        .map(([value]) => value)
        .filter((value) => value != null && value !== "")
        .map(String),
    [data],
  );
  const inference = useMemo(() => inferValueOrder(values), [values]);

  return {
    values: saved ? resolveValueOrder(values, saved) : inference.values,
    inference,
    isSaved: saved != null,
    isInferred: saved == null && inference.isGuess,
    isLoading: fieldId != null && isLoading,
  };
}
