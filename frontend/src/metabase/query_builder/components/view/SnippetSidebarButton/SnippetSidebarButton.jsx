/* eslint-disable react/prop-types */
import { t } from "ttag";
import { Icon } from "metabase/core/components/Icon";
import Tooltip from "metabase/core/components/Tooltip";
import { ButtonRoot } from "./SnippetSidebarButton.styled";

export const SnippetSidebarButton = ({
  toggleSnippetSidebar,
  isShowingSnippetSidebar,
  className,
  size,
}) => (
  <Tooltip tooltip={t`SQL Snippets`}>
    <ButtonRoot className={className} isSelected={isShowingSnippetSidebar}>
      <Icon name="snippet" size={size} onClick={toggleSnippetSidebar} />
    </ButtonRoot>
  </Tooltip>
);
