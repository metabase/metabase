import React from "react";

import { t } from "ttag";
import cx from "classnames";

import Icon from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";

const SnippetSidebarButton = ({
  toggleSnippetSidebar,
  isShowingSnippetSidebar,
  className,
  size,
}) => (
  <Tooltip tooltip={t`SQL Snippets`}>
    <a
      className={cx(className, "transition-color text-brand-hover", {
        "text-brand": isShowingSnippetSidebar,
      })}
    >
      <Icon name="snippet" size={size} onClick={toggleSnippetSidebar} />
    </a>
  </Tooltip>
);

export default SnippetSidebarButton;
