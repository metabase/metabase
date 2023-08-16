import { t } from "ttag";
import { Icon } from "metabase/core/components/Icon";
import Tooltip from "metabase/core/components/Tooltip";
import { ButtonRoot } from "./SnippetSidebarButton.styled";

interface SnippetSidebarButtonProps {
  className?: string;
  isShowingSnippetSidebar: boolean;
  size: number;
  toggleSnippetSidebar: () => void;
}

export const SnippetSidebarButton = ({
  className,
  size,
  isShowingSnippetSidebar,
  toggleSnippetSidebar,
}: SnippetSidebarButtonProps) => (
  <Tooltip tooltip={t`SQL Snippets`}>
    <ButtonRoot className={className} isSelected={isShowingSnippetSidebar}>
      <Icon name="snippet" size={size} onClick={toggleSnippetSidebar} />
    </ButtonRoot>
  </Tooltip>
);
