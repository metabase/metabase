import PropTypes from "prop-types";
import { connect } from "react-redux";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { PLUGIN_MODERATION } from "metabase/plugins";
import {
  setQueryBuilderMode,
  turnModelIntoQuestion,
} from "metabase/query_builder/actions";
import Question from "metabase-lib/v1/Question";

import {
  Button,
  MetadataIndicatorContainer,
  Row,
  SectionContent,
  SectionTitle,
} from "./DatasetManagementSection.styled";
import DatasetMetadataStrengthIndicator from "./DatasetMetadataStrengthIndicator";

const mapDispatchToProps = {
  setQueryBuilderMode,
  turnModelIntoQuestion,
};

DatasetManagementSection.propTypes = {
  dataset: PropTypes.instanceOf(Question).isRequired,
  setQueryBuilderMode: PropTypes.func.isRequired,
  turnModelIntoQuestion: PropTypes.func.isRequired,
};

function DatasetManagementSection({
  dataset,
  setQueryBuilderMode,
  turnModelIntoQuestion,
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
          onClick={turnModelIntoQuestion}
        >{t`Turn back into a saved question`}</Button>
        <PLUGIN_MODERATION.QuestionModerationSection
          question={dataset}
          VerifyButton={Button}
          reviewBannerClassName={CS.mt1}
        />
      </SectionContent>
    </div>
  );
}

export default connect(null, mapDispatchToProps)(DatasetManagementSection);
