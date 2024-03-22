/* eslint-disable react/prop-types */
import { Component } from "react";
import { connect } from "react-redux";
import { t, jt } from "ttag";
import _ from "underscore";

import { CollectionMoveModal } from "metabase/containers/CollectionMoveModal";
import CS from "metabase/css/core/index.css";
import Collection, { ROOT_COLLECTION } from "metabase/entities/collections";
import Dashboards from "metabase/entities/dashboards";
import { color } from "metabase/lib/colors";
import * as Urls from "metabase/lib/urls";
import { Icon } from "metabase/ui";

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
    <Icon name="collection" className={CS.mr1} color="white" />
    {jt`Dashboard moved to ${(
      <Collection.Link
        id={collectionId}
        className={CS.ml1}
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
