import PropTypes from "prop-types";
import { connect } from "react-redux";
import { t } from "ttag";

import {
  setQueryBuilderMode,
  turnDatasetIntoQuestion,
} from "metabase/query_builder/actions";

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
          icon="insight"
          onClick={turnDatasetIntoQuestion}
        >{t`Turn back into a saved question`}</Button>
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
