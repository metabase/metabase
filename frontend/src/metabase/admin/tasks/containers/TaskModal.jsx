import React from "react";
import { t } from "ttag";
import { connect } from "react-redux";
import { goBack } from "react-router-redux";

import Task from "metabase/entities/tasks";

import Code from "metabase/components/Code";
import ModalContent from "metabase/components/ModalContent";

@Task.load({
  id: (state, props) => props.params.taskId,
})
@connect(
  null,
  { goBack },
)
class TaskModal extends React.Component {
  render() {
    const { object } = this.props;
    return (
      <ModalContent title={t`Task details`} onClose={() => this.props.goBack()}>
        <Code>{JSON.stringify(object.task_details)}</Code>
      </ModalContent>
    );
  }
}

export default TaskModal;
