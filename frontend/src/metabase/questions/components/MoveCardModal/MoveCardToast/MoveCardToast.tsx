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
import type { Card, CollectionId, DashboardId } from "metabase-types/api";

import { DestinationLink, StyledIcon, ToastRoot } from "./MoveCardToast.styled";

type MoveCardToastProps = {
  card: Card;
  destination?: MoveDestination;
};

function MoveCardToast({ card, destination }: MoveCardToastProps) {
  const type = card.type;

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
      <DashboardLink key="dashboard" dashboardId={destination.id} />
    ) : (
      <CollectionLink
        key="collection"
        collectionId={coerceCollectionId(destination.id)}
      />
    );

  return (
    <ToastRoot data-testid="move-card-toast">
      <StyledIcon name="collection" />
      {match(type)
        .with("question", () => jt`Question moved to ${link}`)
        .with("model", () => jt`Model moved to ${link}`)
        .with("metric", () => jt`Metric moved to ${link}`)
        .exhaustive()}
    </ToastRoot>
  );
}

const DashboardLink = ({ dashboardId }: { dashboardId: DashboardId }) => {
  const { data: dashboard } = useGetDashboardQuery(
    dashboardId != null ? { id: dashboardId } : skipToken,
  );

  if (!dashboard) {
    return null;
  }

  return (
    <DestinationLink to={Urls.dashboard(dashboard)}>
      {dashboard.name}
    </DestinationLink>
  );
};

const CollectionLink = ({ collectionId }: { collectionId: CollectionId }) => {
  const { data: collection } = useGetCollectionQuery(
    collectionId != null ? { id: collectionId } : skipToken,
  );

  if (!collection) {
    return null;
  }

  return (
    <DestinationLink to={Urls.collection(collection)}>
      {collection.name}
    </DestinationLink>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default MoveCardToast;
