/* eslint-disable react/prop-types */
import { Component } from "react";
import { connect } from "react-redux";
import { t, jt } from "ttag";
import _ from "underscore";

import { Icon } from "metabase/core/components/Icon";
import { CollectionMoveModal } from "metabase/containers/CollectionMoveModal";

import { color } from "metabase/lib/colors";
import * as Urls from "metabase/lib/urls";

import Dashboards from "metabase/entities/dashboards";
import Collection, { ROOT_COLLECTION } from "metabase/entities/collections";
import { ToastRoot } from "./DashboardMoveModal.styled";

const mapDispatchToProps = {
  setDashboardCollection: Dashboards.actions.setCollection,
};

class DashboardMoveModal extends Component {
  render() {
    const { dashboard, onClose, setDashboardCollection } = this.props;
    const title = t`Move dashboard to…`;
    return (
      <CollectionMoveModal
        title={title}
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
  }
}

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

export const DashboardMoveModalConnected = _.compose(
  connect(null, mapDispatchToProps),
  Dashboards.load({
    id: (state, props) => Urls.extractCollectionId(props.params.slug),
  }),
)(DashboardMoveModal);
