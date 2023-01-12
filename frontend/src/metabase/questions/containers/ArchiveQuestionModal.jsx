/* eslint-disable react/prop-types */
import React, { Component } from "react";
import { connect } from "react-redux";
import { withRouter } from "react-router";

import { t, ngettext, msgid } from "ttag";

import ArchiveModal from "metabase/components/ArchiveModal";

import * as Urls from "metabase/lib/urls";
import Questions from "metabase/entities/questions";

const mapDispatchToProps = {
  archive: card => Questions.actions.setArchived(card, true),
};

class ArchiveQuestionModal extends Component {
  onArchive = () => {
    const { question, archive, router } = this.props;

    const card = question.card();
    archive(card);
    router.push(Urls.collection(card.collection));
  };

  render() {
    const { onClose, question } = this.props;

    const isModel = question.isDataset();

    const title = isModel ? t`Archive this model?` : t`Archive this question?`;

    const message = isModel
      ? t`This model will be removed from any dashboards or pulses using it.`
      : t`This question will be removed from any dashboards or pulses using it.`;

    const widgetCount = question.getParameterUsageCount();

    const additionalWarning =
      widgetCount > 0
        ? " " +
          ngettext(
            msgid`It will also be removed from the filter that uses it to populate values.`,
            `It will also be removed from the ${widgetCount} filters that use it to populate values.`,
            widgetCount,
          )
        : "";

    return (
      <ArchiveModal
        title={title}
        message={`${message}${additionalWarning}`}
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
