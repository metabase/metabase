import React from "react";
import { t } from "c-3po";
import { connect } from "react-redux";
import { goBack } from "react-router-redux";

import { entityObjectLoader } from "metabase/entities/containers/EntityObjectLoader";

import Code from "metabase/components/Code";
import ModalContent from "metabase/components/ModalContent";

@entityObjectLoader({
  entityType: "tasks",
  entityId: (state, props) => props.params.taskId,
})
@connect(null, { goBack })
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
