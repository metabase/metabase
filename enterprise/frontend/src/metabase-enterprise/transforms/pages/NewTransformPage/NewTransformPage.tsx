import { useState } from "react";
import { push } from "react-router-redux";

import { useDispatch } from "metabase/lib/redux";
import { Box } from "metabase/ui";
import Question from "metabase-lib/v1/Question";

import { TransformHeader } from "../../components/TransformHeader";
import { TransformQueryBuilder } from "../../components/TransformQueryBuilder";
import { transformListUrl } from "../../utils/urls";

import { NewTransformModal } from "./NewTransformModal";

export function NewTransformPage() {
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
    <Box flex="1 1 0" bg="bg-white">
      <TransformHeader onSave={handleSaveClick} onCancel={handleCancelClick} />
      <TransformQueryBuilder query={query} onChange={setQuery} />
      <NewTransformModal
        query={query}
        isOpened={isOpened}
        onClose={handleCloseClick}
      />
    </Box>
  );
}

function getInitialQuery() {
  return Question.create({ type: "query" }).datasetQuery();
}
