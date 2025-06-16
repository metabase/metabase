import cx from "classnames";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import { toggleSnippetSidebar } from "metabase/query_builder/actions/native";
import { Box, Icon, Tooltip } from "metabase/ui";

import SnippetSidebarButtonS from "./SnippetSidebarButton.module.css";

interface SnippetSidebarButtonProps {
  className?: string;
  isShowingSnippetSidebar: boolean;
  size: number;
}

export const SnippetSidebarButton = ({
  className,
  isShowingSnippetSidebar,
  size,
}: SnippetSidebarButtonProps) => {
  const dispatch = useDispatch();

  return (
    <Tooltip label={t`SQL Snippets`}>
      <Box
        component="a"
        h={size}
        className={cx(className, SnippetSidebarButtonS.ButtonRoot, {
          [SnippetSidebarButtonS.isSelected]: isShowingSnippetSidebar,
        })}
      >
        <Icon
          name="snippet"
          size={size}
          onClick={() => {
            dispatch(toggleSnippetSidebar());
          }}
        />
      </Box>
    </Tooltip>
  );
};
