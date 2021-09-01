/* eslint-disable react/prop-types */
import React, { Component } from "react";
import { connect } from "react-redux";
import { withRouter } from "react-router";

import { t } from "ttag";

import ArchiveModal from "metabase/components/ArchiveModal";

import * as Urls from "metabase/lib/urls";
import Questions from "metabase/entities/questions";

const mapDispatchToProps = {
  archive: id => Questions.actions.setArchived({ id }, true),
};

class ArchiveQuestionModal extends Component {
  onArchive = () => {
    const { question, archive, router } = this.props;
    const card = question.card();
    archive(card.id);
    router.push(Urls.collection(card.collection));
  };

  render() {
    const { onClose } = this.props;
    return (
      <ArchiveModal
        title={t`Archive this question?`}
        message={t`This question will be removed from any dashboards or pulses using it.`}
        onArchive={this.onArchive}
        onClose={onClose}
      />
    );
  }
}

export default connect(
  null,
  mapDispatchToProps,
)(withRouter(ArchiveQuestionModal));
