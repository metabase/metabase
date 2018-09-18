import React from "react";
import { connect } from "react-redux";
import { Box, Flex } from "grid-styled";
import { withRouter } from "react-router";
import { push } from "react-router-redux";
import { t } from "c-3po";

import Button from "metabase/components/Button";
import ModalContent from "metabase/components/ModalContent.jsx";

import * as Urls from "metabase/lib/urls";

import Collections from "metabase/entities/collections";
import { entityObjectLoader } from "metabase/entities/containers/EntityObjectLoader";

const mapDispatchToProps = {
  setCollectionArchived: Collections.actions.setArchived,
  push,
};

@connect(null, mapDispatchToProps)
@entityObjectLoader({
  entityType: "collections",
  entityId: (state, props) => props.params.collectionId,
})
@withRouter
class ArchiveCollectionModal extends React.Component {
  async _archive() {
    const { object, setCollectionArchived, push, params } = this.props;
    await setCollectionArchived({ id: params.collectionId }, true);
    const parentId =
      object.effective_ancestors.length > 0
        ? object.effective_ancestors.pop().id
        : null;
    push(Urls.collection(parentId));
  }
  render() {
    return (
      <ModalContent
        title={t`Archive this collection?`}
        onClose={() => this.props.onClose()}
      >
        <Box>
          <p>
            {t`The dashboards, collections, and pulses in this collection will also be archived.`}
          </p>
          <Flex pt={2}>
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
