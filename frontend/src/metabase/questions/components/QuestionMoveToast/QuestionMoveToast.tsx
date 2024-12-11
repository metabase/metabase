import { Fragment } from "react";
import { match } from "ts-pattern";
import { jt, t } from "ttag";

import {
  skipToken,
  useGetCollectionQuery,
  useGetDashboardQuery,
} from "metabase/api";
import type { MoveDestination } from "metabase/collections/types";
import { coerceCollectionId } from "metabase/collections/utils";
import * as Urls from "metabase/lib/urls";
import type Question from "metabase-lib/v1/Question";

import {
  CollectionLink,
  DashboardLink,
  StyledIcon,
  ToastRoot,
} from "./QuestionMoveToast.styled";

type QuestionMoveToastProps = {
  destination?: MoveDestination;
  question: Question;
};

function QuestionMoveToast({ destination, question }: QuestionMoveToastProps) {
  const type = question.type();
  const collectionId =
    destination?.model === "collection"
      ? coerceCollectionId(destination.id)
      : undefined;
  const dashboardId =
    destination?.model === "dashboard" ? destination.id : undefined;
  const { data: collection } = useGetCollectionQuery(
    collectionId != null ? { id: collectionId } : skipToken,
  );
  const { data: dashboard } = useGetDashboardQuery(
    dashboardId != null ? { id: dashboardId } : skipToken,
  );

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
      dashboard ? (
        <DashboardLink key="dashboard-link" to={Urls.dashboard(dashboard)}>
          {dashboard.name}
        </DashboardLink>
      ) : (
        <Fragment key="dashboard-link-placeholder" />
      )
    ) : collection ? (
      <CollectionLink key="collection-link" to={Urls.collection(collection)}>
        {collection.name}
      </CollectionLink>
    ) : (
      <Fragment key="collection-link-placeholder" />
    );

  return (
    <ToastRoot>
      <StyledIcon name="collection" />
      {match(type)
        .with("question", () => jt`Question moved to ${link}`)
        .with("model", () => jt`Model moved to ${link}`)
        .with("metric", () => jt`Metric moved to ${link}`)
        .exhaustive()}
    </ToastRoot>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default QuestionMoveToast;
