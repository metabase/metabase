import React from "react";
import { connect } from "react-redux";

import Modal from "metabase/components/Modal";
import ModalContent from "metabase/components/ModalContent";

import ActionParametersInputForm from "metabase/writeback/containers/ActionParametersInputForm";

import type { DashboardWithCards } from "metabase-types/types/Dashboard";
import type { State } from "metabase-types/store";

type DataAppDashboard = DashboardWithCards;

interface OwnProps {
  dashboard: DataAppDashboard;
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
    formProps: {},
  };
}

const mapDispatchToProps = {
  closeActionParametersModal: () => {
    // pass
  },
};

function ActionParametersInputModal({
  formProps,
  closeActionParametersModal,
}: Props) {
  return (
    <Modal onClose={closeActionParametersModal}>
      <ModalContent onClose={closeActionParametersModal}>
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
