import React from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { t } from "ttag";

import { setQueryBuilderMode } from "metabase/query_builder/actions";

import { PLUGIN_MODERATION } from "metabase/plugins";
import Question from "metabase-lib/Question";

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
};

DatasetManagementSection.propTypes = {
  dataset: PropTypes.instanceOf(Question).isRequired,
  setQueryBuilderMode: PropTypes.func.isRequired,
};

function DatasetManagementSection({ dataset, setQueryBuilderMode }) {
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
        <PLUGIN_MODERATION.QuestionModerationSection
          question={dataset}
          VerifyButton={Button}
          reviewBannerClassName="mt1"
        />
      </SectionContent>
    </div>
  );
}

export default connect(null, mapDispatchToProps)(DatasetManagementSection);
