import { useMemo, useState } from "react";

import { getDefaultFormSettings } from "metabase/actions/utils";
import * as Lib from "metabase-lib";
import type { ActionFormSettings, DatasetQuery } from "metabase-types/api";

import { useActionQuery } from "../../components/QueryActionEditor/hooks";
import {
  type QueryActionDefinition,
  getQueryActionDefinition,
} from "../../utils";

type UseQueryActionDraftOptions = {
  initialDatasetQuery: DatasetQuery;
  formSettings?: ActionFormSettings;
};

type QueryActionDraft = {
  datasetQuery: DatasetQuery;
  definition: QueryActionDefinition | null;
  isDirty: boolean;
  isValid: boolean;
  setDatasetQuery: (datasetQuery: DatasetQuery) => void;
};

export function useQueryActionDraft({
  initialDatasetQuery,
  formSettings,
}: UseQueryActionDraftOptions): QueryActionDraft {
  const [datasetQuery, setDatasetQuery] = useState(initialDatasetQuery);
  const query = useActionQuery(datasetQuery);

  const definition = useMemo(
    () => getQueryActionDefinition(query, getDefaultFormSettings(formSettings)),
    [query, formSettings],
  );
  const isDirty = !Lib.areLegacyQueriesEqual(datasetQuery, initialDatasetQuery);
  const isValid = definition != null && Lib.canSave(query, "question");

  return { datasetQuery, definition, isDirty, isValid, setDatasetQuery };
}
