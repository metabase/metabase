import PropTypes from "prop-types";
import { connect } from "react-redux";
import { t } from "ttag";

import Button from "metabase/core/components/Button";
import CS from "metabase/css/core/index.css";
import { PLUGIN_MODERATION } from "metabase/plugins";
import {
  setQueryBuilderMode,
  turnModelIntoQuestion,
} from "metabase/query_builder/actions";
import { Box, Flex } from "metabase/ui";
import Question from "metabase-lib/v1/Question";

import DatasetManagementSectionS from "./DatasetManagementSection.module.css";
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
      <Box
        component="span"
        className={DatasetManagementSectionS.SectionTitle}
      >{t`Model management`}</Box>
      <Box mt="md" pos="relative" right={8}>
        <Button
          className={DatasetManagementSectionS.Button}
          iconSize={16}
          icon="notebook"
          onClick={onEditQueryDefinitionClick}
        >{t`Edit query definition`}</Button>
        <Flex align="center" justify="center">
          <Button
            className={DatasetManagementSectionS.Button}
            iconSize={16}
            icon="label"
            onClick={onCustomizeMetadataClick}
          >{t`Customize metadata`}</Button>
          <Flex
            className={DatasetManagementSectionS.MetadataIndicatorContainer}
          >
            <DatasetMetadataStrengthIndicator dataset={dataset} />
          </Flex>
        </Flex>
        <Button
          className={DatasetManagementSectionS.Button}
          iconSize={16}
          icon="insight"
          onClick={turnModelIntoQuestion}
        >{t`Turn back into a saved question`}</Button>
        <PLUGIN_MODERATION.QuestionModerationSection
          question={dataset}
          VerifyButton={Button}
          reviewBannerClassName={CS.mt1}
        />
      </Box>
    </div>
  );
}

export default connect(null, mapDispatchToProps)(DatasetManagementSection);
