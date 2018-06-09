import React from "react";
import { Box, Flex, Subhead } from "rebass";
import cx from "classnames";
import _ from "underscore";
import { t } from "c-3po";

import Button from "metabase/components/Button";
import Icon from "metabase/components/Icon";

import CollectionListLoader from "metabase/containers/CollectionListLoader";
import CollectionPicker, {
  ROOT_COLLECTION,
} from "metabase/containers/CollectionPicker";

class CollectionMoveModal extends React.Component {
  state = {
    // will eventually be the collection object representing the selected collection
    // we store the whole object instead of just the ID so that we can use its
    // name in the action button, and other properties
    selectedCollection: null,
    // whether the move action has started
    // TODO: use this loading and error state in the UI
    moving: false,
    error: null,
  };
  render() {
    const { selectedCollection } = this.state;

    return (
      <Box p={3}>
        <Flex align="center" mb={2}>
          <Subhead>{this.props.title}</Subhead>
          <Icon
            name="close"
            className="ml-auto"
            onClick={() => this.props.onClose()}
          />
        </Flex>
        <CollectionListLoader>
          {({ collections, loading, error }) => (
            <CollectionPicker
              value={selectedCollection ? selectedCollection.id : undefined}
              onChange={id =>
                this.setState({
                  selectedCollection:
                    id == null ? ROOT_COLLECTION : _.find(collections, { id }),
                })
              }
              collections={collections}
            />
          )}
        </CollectionListLoader>
        <Flex mt={2}>
          <Button
            primary
            icon="move"
            className="ml-auto"
            disabled={!selectedCollection}
            onClick={() => {
              try {
                this.setState({ moving: true });
                this.props.onMove(selectedCollection);
              } catch (e) {
                this.setState({ error: e });
              } finally {
                this.setState({ moving: false });
              }
            }}
          >
            {selectedCollection
              ? t`Move to ${selectedCollection.name}`
              : t`Move`}
          </Button>
        </Flex>
      </Box>
    );
  }
}

export default CollectionMoveModal;
