import { useState } from "react";
import { push } from "react-router-redux";

import { useDispatch } from "metabase/lib/redux";
import Question from "metabase-lib/v1/Question";

import { NewTransformFromQueryModal } from "../../components/NewTransformFromQueryModal";
import { TransformQueryBuilder } from "../../components/TransformQueryBuilder";
import { transformListUrl } from "../../utils/urls";

export function NewTransformFromQueryPage() {
  const [query, setQuery] = useState(() => getInitialQuery());
  const [isOpened, setIsOpened] = useState(false);
  const dispatch = useDispatch();

  const handleSaveClick = () => {
    setIsOpened(true);
  };

  const handleCancelClick = () => {
    dispatch(push(transformListUrl()));
  };

  const handleCloseClick = () => {
    setIsOpened(false);
  };

  return (
    <>
      <TransformQueryBuilder
        query={query}
        onChange={setQuery}
        onSave={handleSaveClick}
        onCancel={handleCancelClick}
      />
      <NewTransformFromQueryModal
        query={query}
        isOpened={isOpened}
        onClose={handleCloseClick}
      />
    </>
  );
}

function getInitialQuery() {
  return Question.create({ type: "query" }).datasetQuery();
}
