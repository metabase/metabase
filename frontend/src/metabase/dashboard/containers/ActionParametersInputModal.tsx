import React from "react";
import { connect } from "react-redux";

import Modal from "metabase/components/Modal";
import ModalContent from "metabase/components/ModalContent";

import { WritebackActionEmitter } from "metabase/writeback/types";
import ActionParametersInputForm from "metabase/writeback/containers/ActionParametersInputForm";

import { DashboardWithCards } from "metabase-types/types/Dashboard";
import { State } from "metabase-types/store";

import { closeActionParametersModal } from "../actions";
import { getEmitterParametersFormProps } from "../selectors";

type DataAppDashboard = DashboardWithCards & {
  emitters?: WritebackActionEmitter[];
};

interface OwnProps {
  dashboard: DataAppDashboard;
  focusedEmitterId: number;
}

interface StateProps {
  formProps: any;
}

interface DispatchProps {
  closeActionParametersModal: () => void;
}

type Props = OwnProps & StateProps & DispatchProps;

function mapStateToProps(state: State) {
  return {
    formProps: getEmitterParametersFormProps(state),
  };
}

const mapDispatchToProps = {
  closeActionParametersModal,
};

function ActionParametersInputModal({
  formProps,
  dashboard,
  focusedEmitterId,
  closeActionParametersModal,
}: Props) {
  const emitter = dashboard.emitters?.find(
    emitter => emitter.id === focusedEmitterId,
  );

  if (!emitter) {
    return null;
  }

  const action = emitter.action;
  const title = action.type === "query" ? action.card.name : action.name;

  return (
    <Modal onClose={closeActionParametersModal}>
      <ModalContent title={title} onClose={closeActionParametersModal}>
        <ActionParametersInputForm
          {...formProps}
          onSubmitSuccess={closeActionParametersModal}
        />
      </ModalContent>
    </Modal>
  );
}

export default connect<StateProps, DispatchProps, OwnProps, State>(
  mapStateToProps,
  mapDispatchToProps,
)(ActionParametersInputModal);
