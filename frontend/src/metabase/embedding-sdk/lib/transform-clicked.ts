import type { MetabaseDataPointObject } from "metabase/embedding-sdk/types/plugins";
import type { ClickObject } from "metabase/visualizations/types";
import type Question from "metabase-lib/v1/Question";

import { transformSdkQuestion } from "./transform-question";

/**
 * Transforms the internal question and the `clicked` object into a simpler, less overwhelming structure.
 * We still provide the raw object in `raw` for advanced use cases, such as needing to access
 * mapped values.
 */
export function transformClickedDataPoint(
  clicked: ClickObject,
  question: Question,
): MetabaseDataPointObject {
  return {
    raw: clicked as Record<string, unknown>,

    column: clicked.column
      ? {
          name: clicked.column.name,
          display_name: clicked.column.display_name,
        }
      : undefined,
    value: clicked.value,
    question: transformSdkQuestion(question),
    data: clicked.data?.reduce(
      (acc, curr) => {
        if (curr.col) {
          acc[curr.col.name] = curr.value;
        }
        return acc;
      },
      {} as Record<string, string | number | null | boolean | object>,
    ),
  };
}
