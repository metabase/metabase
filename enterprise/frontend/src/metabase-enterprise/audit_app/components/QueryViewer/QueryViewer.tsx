import { useEffect, useMemo } from "react";
import _ from "underscore";

import * as Lib from "metabase-lib";
import { useSelector, useDispatch } from "metabase/lib/redux";
import NativeQueryEditor from "metabase/query_builder/components/NativeQueryEditor";
import ReadOnlyNotebook from "metabase/query_builder/components/notebook/ReadOnlyNotebook";

import { getMetadata } from "metabase/selectors/metadata";
import { loadMetadataForCard } from "metabase/questions/actions";

import type { DatasetQuery } from "metabase-types/api";

import Question from "metabase-lib/Question";

/**
 * @deprecated use MLv2
 */
export function QueryViewer({ datasetQuery }: { datasetQuery: DatasetQuery }) {
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
  const { isNative } = Lib.queryDisplayInfo(question.query());

  if (isNative) {
    return (
      <NativeQueryEditor
        question={question}
        query={question.legacyQuery()}
        location={{ query: {} }}
        readOnly
        viewHeight={800}
        isNativeEditorOpen
        resizable={false}
      />
    );
  }

  const database = question.database();
  if (database && database.tables) {
    return <ReadOnlyNotebook question={question} />;
  }

  return null;
}
