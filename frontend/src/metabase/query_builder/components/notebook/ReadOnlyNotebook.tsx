import React, { useEffect, useMemo } from "react";
import _ from "underscore";
import { useSelector, useDispatch } from "react-redux";

import { getMetadata } from "metabase/selectors/metadata";
import { loadMetadataForCard } from "metabase/questions/actions";

import Notebook from "metabase/query_builder/components/notebook/Notebook";
import type { StructuredDatasetQuery } from "metabase-types/api";
import Question from "metabase-lib/Question";

import { ReadOnlyNotebookContainer } from "./ReadOnlyNotebook.styled";

export default function ReadOnlyNotebook({
  datasetQuery,
}: {
  datasetQuery: StructuredDatasetQuery;
}) {
  const dispatch = useDispatch();
  const metadata = useSelector(getMetadata, _.isEqual);
  const card = useMemo(() => ({ dataset_query: datasetQuery }), [datasetQuery]);

  useEffect(() => {
    async function loadMetadata() {
      await dispatch(loadMetadataForCard(card as any) as any);
    }
    loadMetadata();
  }, [card, dispatch]);

  if (!datasetQuery.database || !metadata.databases[datasetQuery.database]) {
    return null;
  }

  const question = new Question(card, metadata);

  return (
    <ReadOnlyNotebookContainer data-testid="read-only-notebook">
      <Notebook question={question} hasVisualizeButton={false} readOnly />
    </ReadOnlyNotebookContainer>
  );
}
