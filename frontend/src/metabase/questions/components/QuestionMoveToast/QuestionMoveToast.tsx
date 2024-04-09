import { jt } from "ttag";

import { coerceCollectionId } from "metabase/collections/utils";
import type Question from "metabase-lib/v1/Question";
import type { CollectionId } from "metabase-types/api";

import {
  CollectionLink,
  StyledIcon,
  ToastRoot,
} from "./QuestionMoveToast.styled";

interface QuestionMoveToastProps {
  collectionId: CollectionId;
  question: Question;
}

const getMessage = (question: Question, collectionLink: JSX.Element) => {
  const type = question.type();

  if (type === "question") {
    return jt`Question moved to ${collectionLink}`;
  }

  if (type === "model") {
    return jt`Model moved to ${collectionLink}`;
  }

  throw new Error(`Unknown question.type(): ${type}`);
};

function QuestionMoveToast({ collectionId, question }: QuestionMoveToastProps) {
  const id = coerceCollectionId(collectionId);
  const collectionLink = <CollectionLink key="collection-link" id={id} />;
  return (
    <ToastRoot>
      <StyledIcon name="collection" />
      {getMessage(question, collectionLink)}
    </ToastRoot>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default QuestionMoveToast;
