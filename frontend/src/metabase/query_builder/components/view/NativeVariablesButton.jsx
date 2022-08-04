/* eslint-disable react/prop-types */
import React from "react";

import { t } from "ttag";

import Icon from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";

import NativeQuery from "metabase-lib/lib/queries/NativeQuery";
import { VariableIconContainer } from "./NativeVariablesButton.styled";

const NativeVariablesButton = ({
  toggleTemplateTagsEditor,
  isShowingTemplateTagsEditor,
  className,
  size,
}) => (
  <Tooltip tooltip={t`Variables`}>
    <VariableIconContainer
      className={className}
      isShowingTemplateTagsEditor={isShowingTemplateTagsEditor}
    >
      <Icon name="variable" size={size} onClick={toggleTemplateTagsEditor} />
    </VariableIconContainer>
  </Tooltip>
);

NativeVariablesButton.shouldRender = ({ question }) =>
  question.query() instanceof NativeQuery &&
  question.database() &&
  question.database().hasFeature("native-parameters");

export default NativeVariablesButton;
