import React from "react";
import PropTypes from "prop-types";

import { t } from "c-3po";

import { Flex, Box } from "grid-styled";
import Subhead from "metabase/components/Subhead";
import Button from "metabase/components/Button";
import Icon from "metabase/components/Icon";

import CollectionPicker from "metabase/containers/CollectionPicker";

class CollectionMoveModal extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      // will eventually be the collection object representing the selected collection
      // we store the whole object instead of just the ID so that we can use its
      // name in the action button, and other properties
      //
      //  undefined = no selection
      //  null = root collection
      //  number = non-root collection id
      //
      selectedCollectionId: props.initialCollectionId,
      // whether the move action has started
      // TODO: use this loading and error state in the UI
      moving: false,
      error: null,
    };
  }

  static propTypes = {
    title: PropTypes.string.isRequired,
    onClose: PropTypes.func.isRequired,
    onMove: PropTypes.func.isRequired,
    initialCollectionId: PropTypes.number,
  };

  render() {
    const { selectedCollectionId } = this.state;

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
        <CollectionPicker
          value={selectedCollectionId}
          onChange={selectedCollectionId =>
            this.setState({ selectedCollectionId })
          }
        />
        <Flex mt={2}>
          <Button
            primary
            className="ml-auto"
            disabled={
              selectedCollectionId === undefined ||
              selectedCollectionId === this.props.initialCollectionId
            }
            onClick={() => {
              try {
                this.setState({ moving: true });
                this.props.onMove({ id: selectedCollectionId });
              } catch (e) {
                this.setState({ error: e });
              } finally {
                this.setState({ moving: false });
              }
            }}
          >
            {t`Move`}
          </Button>
        </Flex>
      </Box>
    );
  }
}

export default CollectionMoveModal;
