import { useMemo, useState } from "react";

import { getDefaultFormSettings } from "metabase/actions/utils";
import * as Lib from "metabase-lib";
import type { ActionFormSettings, DatasetQuery } from "metabase-types/api";

import { type ActionDefinition, getActionDefinition } from "../utils";

import { useActionQuery } from "./use-action-query";

type UseActionDraftOptions = {
  initialDatasetQuery: DatasetQuery;
  formSettings?: ActionFormSettings;
};

type ActionDraft = {
  datasetQuery: DatasetQuery;
  definition: ActionDefinition | null;
  isDirty: boolean;
  isValid: boolean;
  setDatasetQuery: (datasetQuery: DatasetQuery) => void;
};

export function useActionDraft({
  initialDatasetQuery,
  formSettings,
}: UseActionDraftOptions): ActionDraft {
  const [datasetQuery, setDatasetQuery] = useState(initialDatasetQuery);
  const query = useActionQuery(datasetQuery);

  const definition = useMemo(
    () => getActionDefinition(query, getDefaultFormSettings(formSettings)),
    [query, formSettings],
  );
  const isDirty = !Lib.areLegacyQueriesEqual(datasetQuery, initialDatasetQuery);
  const isValid =
    definition != null && Lib.rawNativeQuery(query).trim().length > 0;

  return { datasetQuery, definition, isDirty, isValid, setDatasetQuery };
}
