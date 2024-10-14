import { jt } from "ttag";

import { coerceCollectionId } from "metabase/collections/utils";
import type Question from "metabase-lib/v1/Question";
import type { CollectionId, DashboardId } from "metabase-types/api";

import {
  CollectionLink,
  DashboardLink,
  StyledIcon,
  ToastRoot,
} from "./QuestionMoveToast.styled";

interface QuestionMoveToastProps {
  collectionId: CollectionId;
  dashboardId?: DashboardId;
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

  if (type === "metric") {
    return jt`Metric moved to ${collectionLink}`;
  }

  throw new Error(`Unknown question.type(): ${type}`);
};

function QuestionMoveToast({
  collectionId,
  dashboardId,
  question,
}: QuestionMoveToastProps) {
  const link = dashboardId ? (
    <DashboardLink key="dashboard-link" id={dashboardId} />
  ) : (
    <CollectionLink
      key="collection-link"
      id={coerceCollectionId(collectionId)}
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
