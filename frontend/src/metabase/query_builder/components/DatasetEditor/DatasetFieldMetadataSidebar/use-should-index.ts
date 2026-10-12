import { useCallback, useEffect, useState } from "react";
import _ from "underscore";

import type { Field } from "metabase-types/api";
import type { ModelIndex } from "metabase-types/api/modelIndexes";

import type { FieldWithMaybeIndex } from "../../../model-indexes/actions";
import { fieldHasIndex } from "../../../model-indexes/utils";

type UseShouldIndexParams = {
  field: Pick<FieldWithMaybeIndex, "name" | "field_ref" | "should_index">;
  modelIndexes: ModelIndex[] | undefined;
};

type UseShouldIndexResult = {
  shouldIndex: boolean;
  setShouldIndex: (shouldIndex: boolean) => void;
};

// Saving strips the client-only `should_index` before the model index it asks for
// exists, so hold the choice across that gap or the toggle flips off and back on.
export function useShouldIndex({
  field,
  modelIndexes,
}: UseShouldIndexParams): UseShouldIndexResult {
  const [pendingChoices, setPendingChoices] = useState<
    Record<Field["name"], boolean>
  >({});

  const isIndexedOnServer = fieldHasIndex(modelIndexes, {
    field_ref: field.field_ref,
  });
  const pendingChoice = pendingChoices[field.name];

  useEffect(() => {
    if (pendingChoice === isIndexedOnServer) {
      setPendingChoices((choices) => _.omit(choices, field.name));
    }
  }, [field.name, pendingChoice, isIndexedOnServer]);

  const setShouldIndex = useCallback(
    (shouldIndex: boolean) =>
      setPendingChoices((choices) => ({
        ...choices,
        [field.name]: shouldIndex,
      })),
    [field.name],
  );

  return {
    shouldIndex: field.should_index ?? pendingChoice ?? isIndexedOnServer,
    setShouldIndex,
  };
}
