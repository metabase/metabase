import React from "react";
import { t } from "ttag";
import PropTypes from "prop-types";
import { connect } from "react-redux";

import { turnQuestionIntoDataset } from "metabase/query_builder/actions";

import Button from "metabase/components/Button";
import Link from "metabase/components/Link";
import ModalContent from "metabase/components/ModalContent";

import { DatasetFeatureOverview } from "./NewDatasetModal.styled";

const propTypes = {
  turnQuestionIntoDataset: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};

const mapDispatchToProps = {
  turnQuestionIntoDataset,
};

function NewDatasetModal({ turnQuestionIntoDataset, onClose }) {
  const onConfirm = () => {
    turnQuestionIntoDataset();
    onClose();
  };

  return (
    <ModalContent
      footer={[
        <Link
          className="text-brand"
          key="cancel"
          onClick={onClose}
        >{t`Cancel`}</Link>,
        <Button
          key="action"
          primary
          onClick={onConfirm}
        >{t`Turn this into a dataset`}</Button>,
      ]}
    >
      <DatasetFeatureOverview />
    </ModalContent>
  );
}

NewDatasetModal.propTypes = propTypes;

export default connect(null, mapDispatchToProps)(NewDatasetModal);
