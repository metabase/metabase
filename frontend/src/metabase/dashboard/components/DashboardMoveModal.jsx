/* eslint-disable react/prop-types */
import React from "react";
import { withRouter } from "react-router";
import { connect } from "react-redux";
import { t, jt } from "ttag";

import { Flex } from "grid-styled";
import Icon from "metabase/components/Icon";
import CollectionMoveModal from "metabase/containers/CollectionMoveModal";

import { color } from "metabase/lib/colors";
import * as Urls from "metabase/lib/urls";

import Dashboards from "metabase/entities/dashboards";
import Collection, { ROOT_COLLECTION } from "metabase/entities/collections";

const mapDispatchToProps = {
  setDashboardCollection: Dashboards.actions.setCollection,
};

@withRouter
@connect(
  null,
  mapDispatchToProps,
)
class DashboardMoveModal extends React.Component {
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

export default DashboardMoveModal;

const DashboardMoveToast = ({ collectionId }) => (
  <Flex align="center">
    <Icon name="all" mr={1} color="white" />
    {jt`Dashboard moved to ${(
      <Collection.Link id={collectionId} ml={1} color={color("brand")} />
    )}`}
  </Flex>
);
