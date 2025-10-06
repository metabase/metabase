import cx from "classnames";
import { t } from "ttag";

import { Box, Icon, Tooltip } from "metabase/ui";

import SnippetSidebarButtonS from "./SnippetSidebarButton.module.css";

interface SnippetSidebarButtonProps {
  className?: string;
  isShowingSnippetSidebar: boolean;
  toggleSnippetSidebar?: () => void;
  size: number;
}

export const SnippetSidebarButton = ({
  className,
  isShowingSnippetSidebar,
  toggleSnippetSidebar,
  size,
}: SnippetSidebarButtonProps) => {
  return (
    <Tooltip label={t`SQL Snippets`}>
      <Box
        aria-label={t`SQL Snippets`}
        component="a"
        h={size}
        className={cx(className, SnippetSidebarButtonS.ButtonRoot, {
          [SnippetSidebarButtonS.isSelected]: isShowingSnippetSidebar,
        })}
      >
        <Icon name="snippet" size={size} onClick={toggleSnippetSidebar} />
      </Box>
    </Tooltip>
  );
};
