import { connect } from "react-redux";
import { t, jt } from "ttag";
import _ from "underscore";

import { MoveModal } from "metabase/containers/MoveModal";
import Collection, { ROOT_COLLECTION } from "metabase/entities/collections";
import Dashboards from "metabase/entities/dashboards";
import { color } from "metabase/lib/colors";
import * as Urls from "metabase/lib/urls";
import { Icon } from "metabase/ui";
import type { Dashboard, CollectionId, DashboardId } from "metabase-types/api";
import type { State } from "metabase-types/store";

import { ToastRoot } from "./DashboardMoveModal.styled";

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
}) => (
  <ToastRoot>
    <Icon name="collection" className="mr1" color="text-white" />
    {jt`Dashboard moved to ${(
      <Collection.Link
        id={collectionId}
        className="ml1"
        color={color("brand")}
      />
    )}`}
  </ToastRoot>
);

export const DashboardMoveModalConnected = _.compose(
  connect(null, mapDispatchToProps),
  Dashboards.load({
    id: (_state: State, props: { params: { slug: string } }) =>
      Urls.extractCollectionId(props.params.slug),
  }),
)(DashboardMoveModal);
