import { jt, t } from "ttag";

import type { MoveDestination } from "metabase/collections/types";
import { coerceCollectionId } from "metabase/collections/utils";
import type Question from "metabase-lib/v1/Question";

import {
  CollectionLink,
  DashboardLink,
  StyledIcon,
  ToastRoot,
} from "./QuestionMoveToast.styled";

type QuestionMoveToastProps = {
  destination: MoveDestination;
  question: Question;
};

const getMessage = (question: Question, collectionLink: JSX.Element) => {
  const type = question.type();

  if (type === "question") {
    return jt`Question moved to ${collectionLink}`;
  }

  if (type === "model") {
    return jt`Model moved to ${collectionLink}`;
  }

  if (type === "metric") {
    return jt`Metric moved to ${collectionLink}`;
  }

  throw new Error(`Unknown question.type(): ${type}`);
};

function QuestionMoveToast({ destination, question }: QuestionMoveToastProps) {
  if (!destination) {
    return (
      <ToastRoot>
        <StyledIcon name="warning" />
        {t`Something went wrong`}
      </ToastRoot>
    );
  }

  const link =
    destination.model === "dashboard" ? (
      <DashboardLink key="dashboard-link" id={destination.id} />
    ) : (
      <CollectionLink
        key="collection-link"
        id={coerceCollectionId(destination.id)}
      />
    );

  return (
    <ToastRoot>
      <StyledIcon name="collection" />
      {getMessage(question, link)}
    </ToastRoot>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default QuestionMoveToast;
