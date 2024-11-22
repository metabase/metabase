/* eslint-disable react/prop-types */
import { Component } from "react";
import { connect } from "react-redux";
import { withRouter } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";
import _ from "underscore";

import { ArchiveModal } from "metabase/components/ArchiveModal";
import Collection from "metabase/entities/collections";
import * as Urls from "metabase/lib/urls";

const mapDispatchToProps = {
  setCollectionArchived: Collection.actions.setArchived,
  push,
};

class ArchiveCollectionModalInner extends Component {
  archive = async () => {
    const { collection, setCollectionArchived } = this.props;
    await setCollectionArchived(collection, true);
  };

  render() {
    return (
      <ArchiveModal
        title={t`Move this collection to trash?`}
        message={t`The dashboards, collections, and alerts in this collection will also be moved to the trash.`}
        model="collection"
        modelId={this.props.collection.id}
        onClose={this.props.onClose}
        onArchive={this.archive}
      />
    );
  }
}

const ArchiveCollectionModal = _.compose(
  connect(null, mapDispatchToProps),
  Collection.load({
    id: (state, props) => Urls.extractCollectionId(props.params.slug),
  }),
  withRouter,
)(ArchiveCollectionModalInner);

export default ArchiveCollectionModal;
