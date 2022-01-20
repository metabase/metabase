import React from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { t } from "ttag";

import Question from "metabase-lib/lib/Question";

import {
  setQueryBuilderMode,
  turnDatasetIntoQuestion,
} from "metabase/query_builder/actions";

import { PLUGIN_MODERATION } from "metabase/plugins";

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
      <SectionTitle>{t`Model management`}</SectionTitle>
      <SectionContent>
        <Button
          icon="notebook"
          onClick={onEditQueryDefinitionClick}
        >{t`Edit query definition`}</Button>
        <Row>
          <Button
            icon="label"
            onClick={onCustomizeMetadataClick}
          >{t`Customize metadata`}</Button>
          <MetadataIndicatorContainer>
            <DatasetMetadataStrengthIndicator dataset={dataset} />
          </MetadataIndicatorContainer>
        </Row>
        <Button
          icon="model_framed"
          onClick={turnDatasetIntoQuestion}
        >{t`Turn back into a saved question`}</Button>
        <PLUGIN_MODERATION.QuestionModerationSection
          question={dataset}
          reviewBannerClassName="mt1"
          renderActions={VerifyButton}
        />
      </SectionContent>
    </div>
  );
}

VerifyButton.propTypes = {
  isVerified: PropTypes.bool.isRequired,
  verifiedIconName: PropTypes.string.isRequired,
  onVerify: PropTypes.func,
  testID: PropTypes.string,
};

function VerifyButton({ isVerified, onVerify, verifiedIconName, testID }) {
  if (isVerified) {
    return null;
  }
  return (
    <Button icon={verifiedIconName} onClick={onVerify} data-testid={testID}>
      {t`Verify this model`}
    </Button>
  );
}

export default connect(null, mapDispatchToProps)(DatasetManagementSection);
