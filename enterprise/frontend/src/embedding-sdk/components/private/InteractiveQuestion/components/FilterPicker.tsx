import cx from "classnames";

import { FilterColumnPicker } from "metabase/querying/filters/components/FilterPicker/FilterColumnPicker";
import { Box } from "metabase/ui";

import { useInteractiveQuestionContext } from "../context";

import S from "./FilterPicker.module.css";

interface Props {
  className?: string;
  withIcon?: boolean;
}

export const FilterPicker = ({ className, withIcon = false }: Props) => {
  const { question } = useInteractiveQuestionContext();

  const query = question?.query();

  if (!query) {
    return null;
  }

  return (
    <Box className={cx(S.PickerContainer, className)}>
      <FilterColumnPicker
        query={query}
        stageIndex={0}
        checkItemIsSelected={() => false}
        onColumnSelect={() => {}}
        onSegmentSelect={() => {}}
        onExpressionSelect={() => {}}
        withCustomExpression={false}
        withColumnGroupIcon={false}
        withColumnItemIcon={withIcon}
      />
    </Box>
  );
};
