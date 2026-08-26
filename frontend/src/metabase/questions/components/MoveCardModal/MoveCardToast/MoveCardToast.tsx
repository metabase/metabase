import { match } from "ts-pattern";
import { jt, t } from "ttag";

import {
  skipToken,
  useGetCollectionQuery,
  useGetDashboardQuery,
} from "metabase/api";
import type { MoveDestination } from "metabase/common/collections/types";
import { coerceCollectionId } from "metabase/common/collections/utils";
import { Link } from "metabase/common/components/Link";
import { Flex, Icon } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Card, CollectionId, DashboardId } from "metabase-types/api";

import S from "./MoveCardToast.module.css";

type MoveCardToastProps = {
  card: Card;
  destination?: MoveDestination;
};

function MoveCardToast({ card, destination }: MoveCardToastProps) {
  const type = card.type;

  if (!destination) {
    return (
      <Flex align="center">
        <Icon name="warning" color="text-primary-inverse" mr="sm" />
        {t`Something went wrong`}
      </Flex>
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
    <Flex align="center" data-testid="move-card-toast">
      <Icon name="collection" color="text-primary-inverse" mr="sm" />
      {match(type)
        .with("question", () => jt`Question moved to ${link}`)
        .with("model", () => jt`Model moved to ${link}`)
        .with("metric", () => jt`Metric moved to ${link}`)
        .exhaustive()}
    </Flex>
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
    <Link
      variant="brand"
      className={S.destinationLink}
      to={Urls.dashboard(dashboard)}
    >
      {dashboard.name}
    </Link>
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
    <Link
      variant="brand"
      className={S.destinationLink}
      to={Urls.collection(collection)}
    >
      {collection.name}
    </Link>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default MoveCardToast;
