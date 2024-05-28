/* eslint-disable react/prop-types */
import { Component } from "react";
import { connect } from "react-redux";
import { withRouter } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";
import _ from "underscore";

import ArchiveModal from "metabase/components/ArchiveModal";
import Collection from "metabase/entities/collections";
import * as Urls from "metabase/lib/urls";

const mapDispatchToProps = {
  setCollectionArchived: Collection.actions.setArchived,
  push,
};

class ArchiveCollectionModalInner extends Component {
  archive = async () => {
    const { setCollectionArchived, params } = this.props;
    const id = Urls.extractCollectionId(params.slug);
    await setCollectionArchived({ id }, true);
  };

  close = () => {
    const { onClose, object, push } = this.props;
    onClose();

    if (object.archived) {
      const parent =
        object.effective_ancestors.length > 0
          ? object.effective_ancestors.at(-1)
          : null;
      push(Urls.collection(parent));
    }
  };

  render() {
    return (
      <ArchiveModal
        title={t`Archive this collection?`}
        message={t`The dashboards, collections, and pulses in this collection will also be archived.`}
        onClose={this.close}
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
