import React from "react";
import { connect } from "react-redux";
import { Box, Flex } from "grid-styled";
import { withRouter } from "react-router";
import { push } from "react-router-redux";
import { t } from "c-3po";

import Button from "metabase/components/Button";
import ModalContent from "metabase/components/ModalContent.jsx";

import Collections from "metabase/entities/collections";

const mapDispatchToProps = {
  setCollectionArchived: Collections.actions.setArchived,
  push,
};

@connect(null, mapDispatchToProps)
@withRouter
class ArchiveCollectionModal extends React.Component {
  async _archive() {
    await this.props.setCollectionArchived(
      { id: this.props.params.collectionId },
      true,
    );
    this.props.push("/");
  }
  render() {
    return (
      <ModalContent
        title={t`Archive this collection?`}
        onClose={() => this.props.onClose()}
      >
        <Box px={3}>
          <p>
            {t`The dashboards, collections, and pulses in this collection will also be archived.`}
          </p>
          <Flex py={3}>
            <Button warning ml="auto" onClick={() => this._archive()}>
              {t`Archive`}
            </Button>
          </Flex>
        </Box>
      </ModalContent>
    );
  }
}

export default ArchiveCollectionModal;
