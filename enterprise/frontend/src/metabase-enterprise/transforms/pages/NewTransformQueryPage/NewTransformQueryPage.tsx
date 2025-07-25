import { useState } from "react";
import { push } from "react-router-redux";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDispatch } from "metabase/lib/redux";
import Question from "metabase-lib/v1/Question";

import { NewTransformModal } from "../../components/NewTransformModal";
import { TransformQueryBuilder } from "../../components/TransformQueryBuilder";
import { useQueryMetadata } from "../../hooks/use-query-metadata";
import { transformListUrl } from "../../utils/urls";

export function NewTransformQueryPage() {
  const [query, setQuery] = useState(() => getInitialQuery());
  const { isLoaded } = useQueryMetadata(query);
  const [isModalOpened, setIsModalOpened] = useState(false);
  const dispatch = useDispatch();

  const handleSaveClick = () => {
    setIsModalOpened(true);
  };

  const handleCancelClick = () => {
    dispatch(push(transformListUrl()));
  };

  const handleCloseClick = () => {
    setIsModalOpened(false);
  };

  if (!isLoaded) {
    return <LoadingAndErrorWrapper loading />;
  }

  return (
    <>
      <TransformQueryBuilder
        query={query}
        onChange={setQuery}
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
