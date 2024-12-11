import { connect } from "react-redux";
import { c, t } from "ttag";
import _ from "underscore";

import { useGetCollectionQuery } from "metabase/api";
import { MoveModal } from "metabase/containers/MoveModal";
import { ROOT_COLLECTION } from "metabase/entities/collections";
import Dashboards from "metabase/entities/dashboards";
import { color } from "metabase/lib/colors";
import * as Urls from "metabase/lib/urls";
import { Icon } from "metabase/ui";
import type { CollectionId, Dashboard, DashboardId } from "metabase-types/api";
import type { State } from "metabase-types/store";

import { CollectionLink, ToastRoot } from "./DashboardMoveModal.styled";

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
      onMove={async destination => {
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
    <ToastRoot>
      <Icon
        name="collection"
        style={{ marginInlineEnd: "0.25rem" }}
        color="text-white"
      />
      {c("{0} is a location where the dashboard was moved to")
        .jt`Dashboard moved to ${
        collection ? (
          <CollectionLink
            to={Urls.collection(collection)}
            style={{ marginInlineStart: ".25em" }}
            color={color("brand")}
          >
            {collection.name}
          </CollectionLink>
        ) : null
      }`}
    </ToastRoot>
  );
};

export const DashboardMoveModalConnected = _.compose(
  connect(null, mapDispatchToProps),
  Dashboards.load({
    id: (_state: State, props: { params: { slug: string } }) =>
      Urls.extractCollectionId(props.params.slug),
  }),
)(DashboardMoveModal);
