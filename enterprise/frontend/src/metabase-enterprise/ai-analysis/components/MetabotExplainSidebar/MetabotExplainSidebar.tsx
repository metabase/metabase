import cx from "classnames";
import { useCallback } from "react";
import { t } from "ttag";

import Markdown from "metabase/core/components/Markdown";
import { color } from "metabase/lib/colors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import SidebarContent from "metabase/query_builder/components/SidebarContent";

import {
  clearExplanation,
  getAnalysisType,
  getExplanation,
  getIsExplainSidebarVisible,
} from "../../state";

import styles from "./MetabotExplainSidebar.module.css";

type MetabotExplainSidebarProps = {
  className?: string;
};

export function MetabotExplainSidebar({
  className,
}: MetabotExplainSidebarProps) {
  const dispatch = useDispatch();
  const isVisible = useSelector(getIsExplainSidebarVisible);
  const explanation = useSelector(getExplanation);
  const analysisType = useSelector(getAnalysisType);

  const handleClose = useCallback(() => {
    dispatch(clearExplanation());
  }, [dispatch]);

  if (!isVisible || !explanation) {
    return null;
  }

  const title =
    analysisType === "chart"
      ? t`Explain this chart`
      : t`Explain this dashboard`;

  return (
    <SidebarContent
      className={cx(styles.sidebarContent, className)}
      title={title}
      color={color("brand")}
      onClose={handleClose}
    >
      <div className={styles.markdownContainer}>
        <Markdown>{explanation}</Markdown>
      </div>
    </SidebarContent>
  );
}
