/* eslint-disable react/prop-types */
import { Component } from "react";
import { connect } from "react-redux";
import { msgid, ngettext, t } from "ttag";

import ArchiveModal from "metabase/components/ArchiveModal";
import { setArchivedQuestion } from "metabase/query_builder/actions";

const mapDispatchToProps = dispatch => ({
  archive: question => dispatch(setArchivedQuestion(question, true)),
});

const getLabels = question => {
  const type = question.type();

  if (type === "question") {
    return {
      title: t`Move this question to trash?`,
      message: t`This question will be removed from any dashboards or alerts using it.`,
    };
  }

  if (type === "model") {
    return {
      title: t`Move this model to trash?`,
      message: t`This model will be removed from any dashboards or alerts using it.`,
    };
  }

  throw new Error(`Unknown question.type(): ${type}`);
};

class ArchiveQuestionModal extends Component {
  onArchive = () => {
    const { question, archive } = this.props;

    archive(question);
  };

  render() {
    const { onClose, question } = this.props;

    const { title, message } = getLabels(question);
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

export default connect(null, mapDispatchToProps)(ArchiveQuestionModal);
