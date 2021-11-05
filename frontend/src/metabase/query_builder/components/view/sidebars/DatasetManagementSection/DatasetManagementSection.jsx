import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import Question from "metabase-lib/lib/Question";
import Icon from "metabase/components/Icon";

import {
  SectionTitle,
  ActionItemContainer,
} from "./DatasetManagementSection.styled";

ActionItem.propTypes = {
  icon: PropTypes.string.isRequired,
  children: PropTypes.node.isRequired,
};

function ActionItem({ icon, children }) {
  return (
    <ActionItemContainer>
      <Icon name={icon} size={16} />
      {children}
    </ActionItemContainer>
  );
}

DatasetManagementSection.propTypes = {
  dataset: PropTypes.instanceOf(Question).isRequired,
};

export function DatasetManagementSection() {
  return (
    <div>
      <SectionTitle>{t`Dataset management`}</SectionTitle>
      <ActionItem icon="dataset">{t`Turn back into a saved question`}</ActionItem>
    </div>
  );
}
