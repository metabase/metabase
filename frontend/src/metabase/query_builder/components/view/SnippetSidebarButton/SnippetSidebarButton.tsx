import { t } from "ttag";
import { Icon } from "metabase/ui";
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
