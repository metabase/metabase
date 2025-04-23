import { c, t } from "ttag";
import _ from "underscore";

import { useGetCollectionQuery } from "metabase/api";
import { MoveModal } from "metabase/containers/MoveModal";
import Link from "metabase/core/components/Link";
import { ROOT_COLLECTION } from "metabase/entities/collections";
import Dashboards from "metabase/entities/dashboards";
import { color } from "metabase/lib/colors";
import { connect } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { Flex, Icon } from "metabase/ui";
import type { CollectionId, Dashboard, DashboardId } from "metabase-types/api";
import type { State } from "metabase-types/store";

import S from "./DashboardMoveModal.module.css";

const mapDispatchToProps = {
  setDashboardCollection: Dashboards.actions.setCollection,
};

function DashboardMoveModal({
  dashboard,
  onClose,
  setDashboardCollection,
}: {
  dashboard: Dashboard;
  onClose: () => void;
  setDashboardCollection: (
    source: { id: DashboardId },
    destination: { id: CollectionId },
    options: any,
  ) => void;
}) {
  return (
    <MoveModal
      title={t`Move dashboard to…`}
      onClose={onClose}
      initialCollectionId={dashboard.collection_id ?? "root"}
      canMoveToDashboard={false}
      onMove={async (destination) => {
        await setDashboardCollection({ id: dashboard.id }, destination, {
          notify: {
            message: (
              <DashboardMoveToast
                collectionId={destination.id || ROOT_COLLECTION.id}
              />
            ),
          },
        });
        onClose();
      }}
    />
  );
}

const DashboardMoveToast = ({
  collectionId,
}: {
  collectionId: CollectionId;
}) => {
  const { data: collection } = useGetCollectionQuery({ id: collectionId });

  return (
    <Flex align="center">
      <Icon
        name="collection"
        style={{ marginInlineEnd: "0.25rem" }}
        color="text-white"
      />
      {c("{0} is a location where the dashboard was moved to")
        .jt`Dashboard moved to ${
        collection ? (
          <Link
            className={S.CollectionLink}
            to={Urls.collection(collection)}
            style={{ marginInlineStart: ".25em" }}
            color={color("brand")}
          >
            {collection.name}
          </Link>
        ) : null
      }`}
    </Flex>
  );
};

export const DashboardMoveModalConnected = _.compose(
  connect(null, mapDispatchToProps),
  Dashboards.load({
    id: (_state: State, props: { params: { slug: string } }) =>
      Urls.extractCollectionId(props.params.slug),
  }),
)(DashboardMoveModal);
