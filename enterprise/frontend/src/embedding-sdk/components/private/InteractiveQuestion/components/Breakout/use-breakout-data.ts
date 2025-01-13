import type { QuestionStateParams } from "embedding-sdk/types/question";
import {
  type ListItem as BreakoutListItem,
  getBreakoutListItem,
} from "metabase/query_builder/components/view/sidebars/SummarizeSidebar/BreakoutColumnList";
import { useBreakoutQueryHandlers } from "metabase/query_builder/hooks";
import * as Lib from "metabase-lib";

export interface SDKBreakoutItem extends BreakoutListItem {
  breakoutIndex: number;
  removeBreakout: () => void;
  updateBreakout: (column: Lib.ColumnMetadata) => void;
  replaceBreakoutColumn: (column: Lib.ColumnMetadata) => void;
}

export const useBreakoutData = ({
  question,
  updateQuestion,
}: QuestionStateParams): SDKBreakoutItem[] => {
  const onQueryChange = (query: Lib.Query) => {
    if (question) {
      updateQuestion(question.setQuery(query), { run: true });
    }
  };

  const query = question?.query();
  const stageIndex = -1;

  const { onUpdateBreakout, onRemoveBreakout, onReplaceBreakouts } =
    useBreakoutQueryHandlers({ query, onQueryChange, stageIndex });

  const breakouts = query ? Lib.breakouts(query, stageIndex) : [];

  const items: BreakoutListItem[] = query
    ? breakouts.map(breakout =>
        getBreakoutListItem(query, stageIndex, breakout),
      )
    : [];

  return items.map((item, index) => {
    const removeBreakout = () => {
      if (item.breakout) {
        return onRemoveBreakout(item.breakout);
      }
    };

    const updateBreakout = (column: Lib.ColumnMetadata) => {
      if (item.breakout) {
        return onUpdateBreakout(item.breakout, column);
      }
    };

    const replaceBreakoutColumn = (column: Lib.ColumnMetadata) => {
      return onReplaceBreakouts(column);
    };

    return {
      ...item,
      breakoutIndex: index,
      removeBreakout,
      updateBreakout,
      replaceBreakoutColumn,
    };
  });
};
