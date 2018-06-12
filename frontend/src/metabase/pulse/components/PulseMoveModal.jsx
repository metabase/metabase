import React from "react";
import { Box, Flex } from "grid-styled";
import cx from "classnames";
import { withRouter } from "react-router";

import { PulseApi } from "metabase/services";

import Button from "metabase/components/Button";
import Icon from "metabase/components/Icon";

import CollectionListLoader from "metabase/containers/CollectionListLoader";

@withRouter
class PulseMoveModal extends React.Component {
  state = {
    // will eventually be the collection object representing the selected collection
    // we store the whole object instead of just the ID so that we can use its
    // name in the action button, and other properties
    selectedCollection: {},
    // whether the move action has started
    moving: false,
    error: null,
  };

  async _movePulse() {
    try {
      await PulseApi.update({
        id: this.props.params.pulseId,
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
        Move to...
        <CollectionListLoader>
          {({ collections, loading, error }) => {
            if (loading) {
              return <Box>Loading...</Box>;
            }
            return (
              <Box>
                {collections.map(collection => (
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
          <Button primary className="ml-auto" onClick={() => this._movePulse()}>
            Move
          </Button>
        </Flex>
      </Box>
    );
  }
}

export default PulseMoveModal;
