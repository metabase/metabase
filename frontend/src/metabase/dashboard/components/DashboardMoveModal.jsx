import React from "react";
import { Box, Flex, Subhead } from "rebass";
import cx from "classnames";
import { withRouter } from "react-router";

import { DashboardApi } from "metabase/services";

import CollectionListLoader from "metabase/components/CollectionListLoader";
import Button from "metabase/components/Button";
import Icon from "metabase/components/Icon";

@withRouter
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
    try {
      await DashboardApi.update({
        id: this.props.params.dashboardId,
        collection_id: this.state.selectedCollection.id,
      });
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
