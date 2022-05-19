/* eslint-disable react/prop-types */
import React from "react";
import { withRouter } from "react-router";
import { connect } from "react-redux";
import { t, jt } from "ttag";
import _ from "underscore";

import Icon from "metabase/components/Icon";
import CollectionMoveModal from "metabase/containers/CollectionMoveModal";

import { color } from "metabase/lib/colors";
import * as Urls from "metabase/lib/urls";

import Dashboards from "metabase/entities/dashboards";
import Collection, { ROOT_COLLECTION } from "metabase/entities/collections";
import { ToastRoot } from "./DashboardMoveModal.styled";

const mapDispatchToProps = {
  setDashboardCollection: Dashboards.actions.setCollection,
};

class DashboardMoveModalInner extends React.Component {
  render() {
    const { params, onClose, setDashboardCollection } = this.props;
    const dashboardId = Urls.extractEntityId(params.slug);
    return (
      <CollectionMoveModal
        title={t`Move dashboard to...`}
        onClose={onClose}
        onMove={async destination => {
          await setDashboardCollection({ id: dashboardId }, destination, {
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
}

const DashboardMoveModal = _.compose(
  withRouter,
  connect(null, mapDispatchToProps),
)(DashboardMoveModalInner);

export default DashboardMoveModal;

const DashboardMoveToast = ({ collectionId }) => (
  <ToastRoot>
    <Icon name="all" mr={1} color="white" />
    {jt`Dashboard moved to ${(
      <Collection.Link id={collectionId} ml={1} color={color("brand")} />
    )}`}
  </ToastRoot>
);
