import React from "react";
import { withRouter } from "react-router";
import { connect } from "react-redux";
import { t, jt } from "ttag";

import { Flex } from "grid-styled";
import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";
import CollectionMoveModal from "metabase/containers/CollectionMoveModal";

import * as Urls from "metabase/lib/urls";
import { color } from "metabase/lib/colors";

import Dashboards from "metabase/entities/dashboards";
import { ROOT_COLLECTION } from "metabase/entities/collections";

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
    const { onClose, setDashboardCollection } = this.props;
    return (
      <CollectionMoveModal
        title={t`Move dashboard to...`}
        onClose={onClose}
        onMove={async collection => {
          await setDashboardCollection(
            { id: this.props.params.dashboardId },
            collection,
            {
              notify: {
                message: <DashbordMoveToast collection={collection} />,
              },
            },
          );
          onClose();
        }}
      />
    );
  }
}

export default DashboardMoveModal;

const DashbordMoveToast = ({ collection }) => (
  <Flex align="center">
    <Icon name="all" mr={1} color="white" />
    {jt`Dashboard moved to ${(
      <Link
        ml={1}
        color={color("brand")}
        to={Urls.collection(collection && collection.id)}
      >
        {collection ? collection.name : ROOT_COLLECTION.name}
      </Link>
    )}`}
  </Flex>
);
