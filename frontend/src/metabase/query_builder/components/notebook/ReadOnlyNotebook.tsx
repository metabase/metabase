import React, { useEffect, useMemo } from "react";
import _ from "underscore";
import type { AnyAction } from "redux";
import { useSelector, useDispatch } from "react-redux";

import { getMetadata } from "metabase/selectors/metadata";
import { loadMetadataForCard } from "metabase/questions/actions";
import type { DatasetQuery } from "metabase-types/types/Card";

import Notebook from "metabase/query_builder/components/notebook/Notebook";
import type { Card } from "metabase-types/api";
import Question from "metabase-lib/Question";

import { ReadOnlyNotebookContainer } from "./ReadOnlyNotebook.styled";

export default function ReadOnlyNotebook({
  datasetQuery,
}: {
  datasetQuery: DatasetQuery;
}) {
  const dispatch = useDispatch();
  const metadata = useSelector(getMetadata, _.isEqual);
  const card = useMemo(
    () => ({ dataset_query: datasetQuery } as Card),
    [datasetQuery],
  );

  useEffect(() => {
    async function loadMetadata() {
      await dispatch(loadMetadataForCard(card) as unknown as AnyAction);
    }
    loadMetadata();
  }, [card, dispatch]);

  if (!datasetQuery.database || !metadata.databases[datasetQuery.database]) {
    return null;
  }

  const question = new Question(card, metadata);

  return (
    <ReadOnlyNotebookContainer>
      <Notebook question={question} hasVisualizeButton={false} readOnly />
    </ReadOnlyNotebookContainer>
  );
}
