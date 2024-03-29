/* eslint-disable react/prop-types */
import { Component } from "react";
import { connect } from "react-redux";
import { goBack } from "react-router-redux";
import { t } from "ttag";
import _ from "underscore";

import Code from "metabase/components/Code";
import ModalContent from "metabase/components/ModalContent";
import Task from "metabase/entities/tasks";

class TaskModalInner extends Component {
  render() {
    const { object } = this.props;
    return (
      <ModalContent title={t`Task details`} onClose={() => this.props.goBack()}>
        <Code>{JSON.stringify(object.task_details)}</Code>
      </ModalContent>
    );
  }
}

const TaskModal = _.compose(
  Task.load({
    id: (state, props) => props.params.taskId,
  }),
  connect(null, { goBack }),
)(TaskModalInner);

export default TaskModal;
