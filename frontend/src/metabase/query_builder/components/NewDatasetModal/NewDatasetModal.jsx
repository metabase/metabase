import PropTypes from "prop-types";
import { t } from "ttag";

import ModalContent from "metabase/components/ModalContent";
import Button from "metabase/core/components/Button";
import Link from "metabase/core/components/Link";
import CS from "metabase/css/core/index.css";
import { connect } from "metabase/lib/redux";
import { turnQuestionIntoModel } from "metabase/query_builder/actions";
import { Box, Text } from "metabase/ui";

import NewDatasetModalS from "./NewDatasetModal.module.css";

const propTypes = {
  turnQuestionIntoModel: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};

const mapDispatchToProps = {
  turnQuestionIntoModel,
};

function NewDatasetModal({ turnQuestionIntoModel, onClose }) {
  const onConfirm = () => {
    turnQuestionIntoModel();
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
      <Box p="2rem 1rem 0">
        <Box component="img" pt="md" src="app/img/model-illustration.svg" />
        <Text component="h2" mt="2rem" mb="md">{t`Models`}</Text>
        <ul>
          <li className={NewDatasetModalS.DatasetValueProp}>
            {t`Let you update column descriptions and customize metadata to create
            great starting points for exploration.`}
          </li>
          <li className={NewDatasetModalS.DatasetValueProp}>
            {t`Show up higher in search results and get highlighted when other
            users start new questions to promote reuse.`}
          </li>
          <li className={NewDatasetModalS.DatasetValueProp}>
            {t`Live in collections to keep them separate from messy database
            schemas.`}
          </li>
        </ul>
      </Box>
    </ModalContent>
  );
}

NewDatasetModal.propTypes = propTypes;

export default connect(null, mapDispatchToProps)(NewDatasetModal);
