import React, { Component } from "react";
import { connect } from "react-redux";
import { t } from "c-3po";
import Button from "metabase/components/Button";
import Icon from "metabase/components/Icon";
import ModalWithTrigger from "metabase/components/ModalWithTrigger";
import Tooltip from "metabase/components/Tooltip";

import { archiveQuestion } from "metabase/query_builder/actions";

const mapStateToProps = () => ({});

const mapDispatchToProps = {
  archiveQuestion,
};

@connect(mapStateToProps, mapDispatchToProps)
class ArchiveQuestionModal extends Component {
  onArchive = async () => {
    try {
      await this.props.archiveQuestion();
      this.onClose();
    } catch (error) {
      console.error(error);
      this.setState({ error });
    }
  };

  onClose = () => {
    if (this.refs.archiveModal) {
      this.refs.archiveModal.close();
    }
  };

  render() {
    return (
      <ModalWithTrigger
        ref="archiveModal"
        triggerElement={
          <Tooltip key="archive" tooltip={t`Archive`}>
            <span className="text-brand-hover">
              <Icon name="archive" size={16} />
            </span>
          </Tooltip>
        }
        title={t`Archive this question?`}
        footer={[
          <Button key="cancel" onClick={this.onClose}>{t`Cancel`}</Button>,
          <Button
            key="archive"
            warning
            onClick={this.onArchive}
          >{t`Archive`}</Button>,
        ]}
      >
        <div
        >{t`This question will be removed from any dashboards or pulses using it.`}</div>
      </ModalWithTrigger>
    );
  }
}

export default ArchiveQuestionModal;
