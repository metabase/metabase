import React from "react";
import { Box, Flex } from "grid-styled";
import cx from "classnames";
import { withRouter } from "react-router";
import { connect } from "react-redux";
import { jt } from "c-3po";
import * as Urls from "metabase/lib/urls";
import { normal } from "metabase/lib/colors";

import { DashboardApi } from "metabase/services";
import { addUndo, createUndo } from "metabase/redux/undo";

import Button from "metabase/components/Button";
import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";
import Subhead from "metabase/components/Subhead"

import CollectionListLoader from "metabase/containers/CollectionListLoader";

const mapDispatchToProps = {
  addUndo,
  createUndo,
};

const DashbordMoveToast = ({ collection }) => (
  <Flex align="center">
    <Icon name="all" mr={1} color="white" />
    {jt`Dashboard moved to ${(
      <Link ml={1} color={normal.blue} to={Urls.collection(collection.id)}>
        {collection.name}
      </Link>
    )}`}
  </Flex>
);

@withRouter
@connect(null, mapDispatchToProps)
class DashboardMoveModal extends React.Component {
  state = {
    // will eventually be the collection object representing the selected collection
    // we store the whole object instead of just the ID so that we can use its
    // name in the action button, and other properties
    selectedCollection: {},
    // whether the move action has started
    moving: false,
    error: null,
  };

  async _moveDashboard() {
    const { addUndo, createUndo } = this.props;
    const { selectedCollection } = this.state;

    try {
      await DashboardApi.update({
        id: this.props.params.dashboardId,
        collection_id: this.state.selectedCollection.id,
      });
      addUndo(
        createUndo({
          type: "dashboard-move-confirm",
          message: <DashbordMoveToast collection={selectedCollection} />,
        }),
      );
      this.props.onClose();
    } catch (error) {
      this.setState({ error, moving: false });
    }
  }
  render() {
    const { selectedCollection } = this.state;
    return (
      <Box p={3}>
        <Flex align="center">
          <Subhead>Move dashboard to...</Subhead>
          <Icon
            name="close"
            className="ml-auto"
            onClick={() => this.props.onClose()}
          />
        </Flex>
        <CollectionListLoader>
          {({ collections, loading, error }) => {
            return (
              <Box>
                {collections
                  .concat({ name: "None", id: null })
                  .map(collection => (
                    <Box
                      my={1}
                      p={1}
                      onClick={() =>
                        this.setState({ selectedCollection: collection })
                      }
                      className={cx(
                        "bg-brand-hover text-white-hover cursor-pointer rounded",
                        {
                          "bg-brand text-white":
                            selectedCollection.id === collection.id,
                        },
                      )}
                    >
                      <Flex align="center">
                        <Icon name="all" color={"#DCE1E4"} size={32} />
                        <h4 className="ml1">{collection.name}</h4>
                      </Flex>
                    </Box>
                  ))}
              </Box>
            );
          }}
        </CollectionListLoader>
        <Flex>
          <Button
            primary
            className="ml-auto"
            onClick={() => this._moveDashboard()}
          >
            Move
          </Button>
        </Flex>
      </Box>
    );
  }
}

export default DashboardMoveModal;
