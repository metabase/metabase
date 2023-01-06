import useAsync from "metabase/core/hooks/use-async";
import { getResponseErrorMessage } from "metabase/core/utils/errors";
import { formatNativeQuery } from "metabase/lib/engine";
import { NativeQueryForm } from "metabase-types/api";
import Question from "metabase-lib/Question";

export const useNativeQuery = (
  question: Question | undefined,
  getNativeQuery: () => Promise<NativeQueryForm>,
) => {
  return useAsync(async () => {
    try {
      const query = await getNativeQuery();
      return formatNativeQuery(query, question?.database()?.engine);
    } catch (error) {
      throw getResponseErrorMessage(error);
    }
  }, [question, getNativeQuery]);
};
