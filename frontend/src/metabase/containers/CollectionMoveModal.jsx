import React from "react";
import PropTypes from "prop-types";

import { t } from "ttag";

import { Button } from "metabase/core/components/Button";
import ModalContent from "metabase/components/ModalContent";

import CollectionPicker from "metabase/containers/CollectionPicker";
import { ButtonContainer } from "./CollectionMoveModal.styled";

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
      <ModalContent title={this.props.title} onClose={this.props.onClose}>
        <CollectionPicker
          value={selectedCollectionId}
          onChange={selectedCollectionId =>
            this.setState({ selectedCollectionId })
          }
        />
        <ButtonContainer>
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
        </ButtonContainer>
      </ModalContent>
    );
  }
}

export default CollectionMoveModal;
