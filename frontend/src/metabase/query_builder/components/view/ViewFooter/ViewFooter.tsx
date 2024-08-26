import cx from "classnames";

import CS from "metabase/css/core/index.css";
import { useSelector } from "metabase/lib/redux";
import { getIsVisualized } from "metabase/query_builder/selectors";
import { Group } from "metabase/ui";
import * as Lib from "metabase-lib";

import { ViewFooterRoot } from "../ViewFooter.styled";

import {
  CenterViewFooterButtonGroup,
  type CenterViewFooterButtonGroupProps,
} from "./CenterViewFooterButtonGroup";
import { LeftViewFooterButtonGroup } from "./LeftViewFooterButtonGroup";
import {
  RightViewFooterButtonGroup,
  type RightViewFooterButtonGroupProps,
} from "./RightViewFooterButtonGroup";

type ViewFooterProps = CenterViewFooterButtonGroupProps &
  RightViewFooterButtonGroupProps;

export const ViewFooter = ({
  question,
  result,
  className,
  isShowingRawTable,
  setUIControls,
  isObjectDetail,
}: ViewFooterProps) => {
  const isVisualized = useSelector(getIsVisualized);

  if (!result) {
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
      <Group position="apart" pos="relative" noWrap w="100%">
        <Group className={CS.flex1}>
          {!hideChartSettings && <LeftViewFooterButtonGroup />}
        </Group>
        {isVisualized && (
          <Group>
            <CenterViewFooterButtonGroup
              setUIControls={setUIControls}
              question={question}
              isShowingRawTable={isShowingRawTable}
            />
          </Group>
        )}
        <Group noWrap>
          <RightViewFooterButtonGroup
            question={question}
            result={result}
            isObjectDetail={isObjectDetail}
          />
        </Group>
      </Group>
    </ViewFooterRoot>
  );
};
