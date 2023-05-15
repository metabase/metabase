import React, { useEffect, useMemo } from "react";
import _ from "underscore";

import { useSelector, useDispatch } from "metabase/lib/redux";
import NativeQueryEditor from "metabase/query_builder/components/NativeQueryEditor";
import ReadOnlyNotebook from "metabase/query_builder/components/notebook/ReadOnlyNotebook";

import { getMetadata } from "metabase/selectors/metadata";
import { loadMetadataForCard } from "metabase/questions/actions";

import type { DatasetQuery } from "metabase-types/api";

import Question from "metabase-lib/Question";

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default function QueryViewer({
  datasetQuery,
}: {
  datasetQuery: DatasetQuery;
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

  const question = new Question(card, metadata);

  const query = question.query();

  if (question.isNative()) {
    return (
      <NativeQueryEditor
        question={question}
        query={query}
        location={{ query: {} }}
        readOnly
        viewHeight={800}
        isNativeEditorOpen
        resizable={false}
      />
    );
  }

  if (query.tables()) {
    return <ReadOnlyNotebook question={question} />;
  }

  return null;
}
