/* eslint-disable react/prop-types */
import React from "react";
import { t } from "ttag";
import Icon from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";
import { SnippetIconContainer } from "./SnippetSidebarButton.styled";

const SnippetSidebarButton = ({
  toggleSnippetSidebar,
  isShowingSnippetSidebar,
  className,
  size,
}) => (
  <Tooltip tooltip={t`SQL Snippets`}>
    <SnippetIconContainer
      className={className}
      isShowingSnippetSidebar={isShowingSnippetSidebar}
    >
      <Icon name="snippet" size={size} onClick={toggleSnippetSidebar} />
    </SnippetIconContainer>
  </Tooltip>
);

export default SnippetSidebarButton;
