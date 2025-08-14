import cx from "classnames";
import { t } from "ttag";

import { useDispatch, useSelector } from "metabase/lib/redux";
import { updateQuestion } from "metabase/query_builder/actions";
import { getQuestion } from "metabase/query_builder/selectors";
import { Flex, Icon } from "metabase/ui";

import S from "./ViewStyleToggle.module.css";

type ViewStyleToggleProps = {
  className?: string;
};

export const ViewStyleToggle = ({ className }: ViewStyleToggleProps) => {
  const question = useSelector(getQuestion);
  const dispatch = useDispatch();

  const isShowingListView = question?.display() === "list";

  const handleTableClick = () => {
    if (question) {
      const nextQuestion = question.setDisplay("table");
      dispatch(updateQuestion(nextQuestion));
    }
  };

  const handleListClick = () => {
    if (question) {
      const nextQuestion = question.setDisplay("list");
      dispatch(updateQuestion(nextQuestion));
    }
  };

  return (
    <Flex className={cx(S.Well, className)}>
      <Flex
        className={cx(S.ToggleIcon, {
          [S.active]: !isShowingListView,
        })}
        aria-label={t`Switch to table view`}
        onClick={handleTableClick}
      >
        <Icon name="table2" tooltip={t`Switch to table view`} />
      </Flex>
      <Flex
        className={cx(S.ToggleIcon, {
          [S.active]: isShowingListView,
        })}
        aria-label={t`Switch to list view`}
        onClick={handleListClick}
      >
        <Icon name="list" tooltip={t`Switch to list view`} />
      </Flex>
    </Flex>
  );
};
