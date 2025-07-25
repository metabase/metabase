import { useState } from "react";
import { push } from "react-router-redux";

import { useDispatch } from "metabase/lib/redux";
import Question from "metabase-lib/v1/Question";
import type { DatasetQuery } from "metabase-types/api";

import { NewTransformModal } from "../../components/NewTransformModal";
import { TransformQueryBuilder } from "../../components/TransformQueryBuilder";
import { transformListUrl } from "../../utils/urls";

export function NewTransformQueryPage() {
  const [query, setQuery] = useState(() => getInitialQuery());
  const [isModalOpened, setIsModalOpened] = useState(false);
  const dispatch = useDispatch();

  const handleSaveClick = (newQuery: DatasetQuery) => {
    setQuery(newQuery);
    setIsModalOpened(true);
  };

  const handleCancelClick = () => {
    dispatch(push(transformListUrl()));
  };

  const handleCloseClick = () => {
    setIsModalOpened(false);
  };

  return (
    <>
      <TransformQueryBuilder
        query={query}
        onSave={handleSaveClick}
        onCancel={handleCancelClick}
      />
      <NewTransformModal
        query={query}
        isOpened={isModalOpened}
        onClose={handleCloseClick}
      />
    </>
  );
}

function getInitialQuery() {
  return Question.create({ type: "query" }).datasetQuery();
}
