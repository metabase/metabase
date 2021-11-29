import React from "react";
import { t, jt } from "ttag";
import PropTypes from "prop-types";
import { connect } from "react-redux";

import { turnQuestionIntoDataset } from "metabase/query_builder/actions";

import Button from "metabase/components/Button";
import ModalContent from "metabase/components/ModalContent";

import {
  DatasetFeatureOverview,
  DatasetFeaturesContainer,
} from "./NewDatasetModal.styled";

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
      title={t`Create datasets to make it easier for everyone to explore.`}
      footer={[
        <Button key="cancel" onClick={onClose}>{t`Cancel`}</Button>,
        <Button
          key="action"
          primary
          onClick={onConfirm}
        >{t`Turn this into a dataset`}</Button>,
      ]}
    >
      <DatasetFeaturesContainer>
        <DatasetFeatureOverview icon="dataset">
          {jt`You’ll see them in the ${(
            <strong>{t`Datasets section`}</strong>
          )} when creating a new question.`}
        </DatasetFeatureOverview>
        <DatasetFeatureOverview icon="folder">
          {jt`Easily ${(
            <strong>{t`open a dataset from its collection`}</strong>
          )} or via Search to start a new question.`}
        </DatasetFeatureOverview>
        <DatasetFeatureOverview icon="label">
          {jt`You can ${(
            <strong>{t`customize a dataset’s metadata`}</strong>
          )} to make it even easier to explore the data.`}
        </DatasetFeatureOverview>
      </DatasetFeaturesContainer>
    </ModalContent>
  );
}

NewDatasetModal.propTypes = propTypes;

export default connect(null, mapDispatchToProps)(NewDatasetModal);
