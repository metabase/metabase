import { t } from "ttag";

import Tooltip from "metabase/core/components/Tooltip";
import { Icon } from "metabase/ui";

import { ButtonRoot } from "./SnippetSidebarButton.styled";

interface SnippetSidebarButtonProps {
  className?: string;
  isShowingSnippetSidebar: boolean;
  size: number;
  toggleSnippetSidebar: () => void;
}

export const SnippetSidebarButton = ({
  className,
  isShowingSnippetSidebar,
  size,
  toggleSnippetSidebar,
}: SnippetSidebarButtonProps) => (
  <Tooltip tooltip={t`SQL Snippets`}>
    <ButtonRoot className={className} isSelected={isShowingSnippetSidebar}>
      <Icon name="snippet" size={size} onClick={toggleSnippetSidebar} />
    </ButtonRoot>
  </Tooltip>
);
