/* eslint-disable react/prop-types */
import { connect } from "react-redux";
import { t, jt } from "ttag";
import _ from "underscore";

import { useGetDashboardQuery } from "metabase/api";
import { CollectionMoveModal } from "metabase/containers/CollectionMoveModal";
import Collection, { ROOT_COLLECTION } from "metabase/entities/collections";
import Dashboards from "metabase/entities/dashboards";
import { color } from "metabase/lib/colors";
import * as Urls from "metabase/lib/urls";
import { Icon } from "metabase/ui";

import { ToastRoot } from "./DashboardMoveModal.styled";

const mapDispatchToProps = {
  setDashboardCollection: Dashboards.actions.setCollection,
};

const DashboardMoveModal = ({ params, onClose, setDashboardCollection }) => {
  // TODO LATER: handle error / loading states
  const { data: dashboard } = useGetDashboardQuery(
    Urls.extractCollectionId(params.slug),
  );

  return (
    <CollectionMoveModal
      title={t`Move dashboard to…`}
      onClose={onClose}
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
};

const DashboardMoveToast = ({ collectionId }) => (
  <ToastRoot>
    <Icon name="collection" className="mr1" color="white" />
    {jt`Dashboard moved to ${(
      <Collection.Link
        id={collectionId}
        className="ml1"
        color={color("brand")}
      />
    )}`}
  </ToastRoot>
);

export const DashboardMoveModalConnected = connect(
  null,
  mapDispatchToProps,
)(DashboardMoveModal);
