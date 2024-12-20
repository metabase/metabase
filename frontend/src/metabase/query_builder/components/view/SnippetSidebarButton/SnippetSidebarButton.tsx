import cx from "classnames";
import { t } from "ttag";

import Tooltip from "metabase/core/components/Tooltip";
import { Icon } from "metabase/ui";

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
  <Tooltip tooltip={t`SQL Snippets`}>
    <a
      className={cx(className, SnippetSidebarButtonS.ButtonRoot, {
        [SnippetSidebarButtonS.isSelected]: isShowingSnippetSidebar,
      })}
    >
      <Icon name="snippet" size={size} onClick={toggleSnippetSidebar} />
    </a>
  </Tooltip>
);
