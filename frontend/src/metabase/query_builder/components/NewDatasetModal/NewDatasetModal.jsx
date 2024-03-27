import PropTypes from "prop-types";
import { connect } from "react-redux";
import { t } from "ttag";

import ModalContent from "metabase/components/ModalContent";
import Button from "metabase/core/components/Button";
import Link from "metabase/core/components/Link";
import CS from "metabase/css/core/index.css";
import { turnQuestionIntoDataset } from "metabase/query_builder/actions";

import {
  FeatureOverviewContainer,
  DatasetImg,
  DatasetTitle,
  DatasetValueProp,
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
      footer={[
        <Link
          className={CS.textBrand}
          key="cancel"
          onClick={onClose}
        >{t`Cancel`}</Link>,
        <Button
          key="action"
          primary
          onClick={onConfirm}
        >{t`Turn this into a model`}</Button>,
      ]}
    >
      <FeatureOverviewContainer>
        <DatasetImg src="app/img/model-illustration.svg" />
        <DatasetTitle>{t`Models`}</DatasetTitle>
        <ul>
          <DatasetValueProp>
            {t`Let you update column descriptions and customize metadata to create
            great starting points for exploration.`}
          </DatasetValueProp>
          <DatasetValueProp>
            {t`Show up higher in search results and get highlighted when other
            users start new questions to promote reuse.`}
          </DatasetValueProp>
          <DatasetValueProp>
            {t`Live in collections to keep them separate from messy database
            schemas.`}
          </DatasetValueProp>
        </ul>
      </FeatureOverviewContainer>
    </ModalContent>
  );
}

NewDatasetModal.propTypes = propTypes;

export default connect(null, mapDispatchToProps)(NewDatasetModal);
