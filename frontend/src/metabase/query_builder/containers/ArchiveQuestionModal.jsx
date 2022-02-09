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
    const { onClose, question } = this.props;

    const isModel = question.isDataset();

    const title = isModel ? t`Archive this model?` : t`Archive this question?`;

    const message = isModel
      ? t`This model will be removed from any dashboards or pulses using it.`
      : t`This question will be removed from any dashboards or pulses using it.`;

    return (
      <ArchiveModal
        title={title}
        message={message}
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
