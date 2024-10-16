import cx from "classnames";

import CS from "metabase/css/core/index.css";
import { useSelector } from "metabase/lib/redux";
import {
  getFirstQueryResult,
  getIsVisualized,
  getQuestion,
} from "metabase/query_builder/selectors";
import { Group } from "metabase/ui";
import * as Lib from "metabase-lib";

import { ViewFooterRoot } from "../ViewFooter.styled";

import { CenterViewFooterButtonGroup } from "./CenterViewFooterButtonGroup";
import { LeftViewFooterButtonGroup } from "./LeftViewFooterButtonGroup";
import { RightViewFooterButtonGroup } from "./RightViewFooterButtonGroup";

type ViewFooterProps = { className?: string };

export const ViewFooter = ({ className }: ViewFooterProps) => {
  const isVisualized = useSelector(getIsVisualized);
  const question = useSelector(getQuestion);
  const result = useSelector(getFirstQueryResult);

  if (!question || !result) {
    return null;
  }

  const { isEditable } = Lib.queryDisplayInfo(question.query());
  const hideChartSettings =
    (result.error && !isEditable) || question.isArchived();

  return (
    <ViewFooterRoot
      className={cx(className, CS.textMedium, CS.borderTop, CS.fullWidth)}
      data-testid="view-footer"
    >
      <Group justify="space-between" pos="relative" wrap="nowrap" w="100%">
        {!hideChartSettings && <LeftViewFooterButtonGroup />}
        {isVisualized && <CenterViewFooterButtonGroup />}
        <RightViewFooterButtonGroup />
      </Group>
    </ViewFooterRoot>
  );
};
