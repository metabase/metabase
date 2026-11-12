import { t } from "ttag";

import { ActionIcon, Icon, Tooltip } from "metabase/ui";

interface SnippetSidebarButtonProps {
  className?: string;
  isShowingSnippetSidebar: boolean;
  toggleSnippetSidebar?: () => void;
}

export const SnippetSidebarButton = ({
  className,
  isShowingSnippetSidebar,
  toggleSnippetSidebar,
}: SnippetSidebarButtonProps) => (
  <Tooltip label={t`SQL Snippets`}>
    <ActionIcon
      variant="subtle"
      className={className}
      aria-label={t`SQL Snippets`}
      aria-pressed={isShowingSnippetSidebar}
      selected={isShowingSnippetSidebar}
      onClick={toggleSnippetSidebar}
    >
      <Icon name="snippet" />
    </ActionIcon>
  </Tooltip>
);
