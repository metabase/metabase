import React from "react";
import { connect } from "react-redux";

import Modal from "metabase/components/Modal";
import ModalContent from "metabase/components/ModalContent";

import ActionParametersInputForm from "metabase/writeback/containers/ActionParametersInputForm";

import type { WritebackAction } from "metabase-types/api";
import type { State } from "metabase-types/store";

import { closeActionParametersModal } from "../actions";
import { getActionParametersModalFormProps } from "../selectors";

interface OwnProps {
  action: WritebackAction;
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
    formProps: getActionParametersModalFormProps(state),
  };
}

const mapDispatchToProps = {
  closeActionParametersModal,
};

function ActionParametersInputModal({
  formProps,
  action,
  closeActionParametersModal,
}: Props) {
  return (
    <Modal onClose={closeActionParametersModal}>
      <ModalContent title={action.name} onClose={closeActionParametersModal}>
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
