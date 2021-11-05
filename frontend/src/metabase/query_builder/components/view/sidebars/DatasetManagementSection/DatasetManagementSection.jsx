import React from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { t } from "ttag";

import Question from "metabase-lib/lib/Question";
import Icon from "metabase/components/Icon";

import { turnDatasetIntoQuestion } from "metabase/query_builder/actions";

import {
  SectionTitle,
  ActionItemContainer,
} from "./DatasetManagementSection.styled";

ActionItem.propTypes = {
  icon: PropTypes.string.isRequired,
  children: PropTypes.node.isRequired,
};

function ActionItem({ icon, children, ...props }) {
  return (
    <ActionItemContainer {...props}>
      <Icon name={icon} size={16} />
      {children}
    </ActionItemContainer>
  );
}

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
      <ActionItem
        icon="dataset_framed"
        onClick={turnDatasetIntoQuestion}
      >{t`Turn back into a saved question`}</ActionItem>
    </div>
  );
}

export default connect(
  null,
  mapDispatchToProps,
)(DatasetManagementSection);
