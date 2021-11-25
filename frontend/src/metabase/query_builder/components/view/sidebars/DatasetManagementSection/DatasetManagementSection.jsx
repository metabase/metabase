import React from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { t } from "ttag";

import Question from "metabase-lib/lib/Question";

import { turnDatasetIntoQuestion } from "metabase/query_builder/actions";

import { Button, SectionTitle } from "./DatasetManagementSection.styled";

const mapDispatchToProps = {
  turnDatasetIntoQuestion,
};

DatasetManagementSection.propTypes = {
  dataset: PropTypes.instanceOf(Question).isRequired,
  turnDatasetIntoQuestion: PropTypes.func.isRequired,
};

function DatasetManagementSection({ turnDatasetIntoQuestion }) {
  return (
    <div>
      <SectionTitle>{t`Dataset management`}</SectionTitle>
      <Button
        icon="dataset_framed"
        onClick={turnDatasetIntoQuestion}
      >{t`Turn back into a saved question`}</Button>
    </div>
  );
}

export default connect(null, mapDispatchToProps)(DatasetManagementSection);
