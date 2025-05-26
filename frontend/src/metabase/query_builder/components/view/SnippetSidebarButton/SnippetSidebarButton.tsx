import cx from "classnames";
import { t } from "ttag";

import { Box, Icon, Tooltip } from "metabase/ui";

import SnippetSidebarButtonS from "./SnippetSidebarButton.module.css";

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
  <Tooltip label={t`SQL Snippets`}>
    <Box
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
