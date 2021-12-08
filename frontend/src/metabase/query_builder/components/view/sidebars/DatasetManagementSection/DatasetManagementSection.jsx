import React from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { t } from "ttag";

import Question from "metabase-lib/lib/Question";

import {
  setQueryBuilderMode,
  turnDatasetIntoQuestion,
} from "metabase/query_builder/actions";

import DatasetMetadataStrengthIndicator from "./DatasetMetadataStrengthIndicator";
import {
  Button,
  MetadataIndicatorContainer,
  Row,
  SectionContent,
  SectionTitle,
} from "./DatasetManagementSection.styled";

const mapDispatchToProps = {
  setQueryBuilderMode,
  turnDatasetIntoQuestion,
};

DatasetManagementSection.propTypes = {
  dataset: PropTypes.instanceOf(Question).isRequired,
  setQueryBuilderMode: PropTypes.func.isRequired,
  turnDatasetIntoQuestion: PropTypes.func.isRequired,
};

function DatasetManagementSection({
  dataset,
  setQueryBuilderMode,
  turnDatasetIntoQuestion,
}) {
  const onEditQueryDefinitionClick = () => {
    setQueryBuilderMode("dataset", {
      datasetEditorTab: "query",
    });
  };

  const onCustomizeMetadataClick = () => {
    setQueryBuilderMode("dataset", {
      datasetEditorTab: "metadata",
    });
  };

  return (
    <div>
      <SectionTitle>{t`Dataset management`}</SectionTitle>
      <SectionContent>
        <Button
          icon="notebook"
          onClick={onEditQueryDefinitionClick}
        >{t`Edit query definition`}</Button>
        <Row>
          <Button
            icon="label"
            onClick={onCustomizeMetadataClick}
          >{t`Customize Metadata`}</Button>
          <MetadataIndicatorContainer>
            <DatasetMetadataStrengthIndicator dataset={dataset} />
          </MetadataIndicatorContainer>
        </Row>
        <Button
          icon="dataset_framed"
          onClick={turnDatasetIntoQuestion}
        >{t`Turn back into a saved question`}</Button>
      </SectionContent>
    </div>
  );
}

export default connect(null, mapDispatchToProps)(DatasetManagementSection);
