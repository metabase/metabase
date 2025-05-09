import { t } from "ttag";

import {
  QuestionPickerModal,
  type QuestionPickerValueItem,
  getQuestionPickerValue,
} from "metabase/common/components/QuestionPicker";
import { isQuestionDashCard } from "metabase/dashboard/utils";
import { useDispatch } from "metabase/lib/redux";
import { addUndo } from "metabase/redux/undo";
import {
  type BaseDashboardCard,
  type Card,
  type Dashboard,
  type RecentItem,
  isRecentCollectionItem,
} from "metabase-types/api";

import { replaceCard, setDashCardAttributes } from "../../actions";

type ReplaceCardModalProps = {
  dashboard: Dashboard;
  replaceCardModalDashCard: BaseDashboardCard | null;
  setReplaceCardModalDashCard: (card: BaseDashboardCard | null) => void;
};

export const ReplaceCardModal = ({
  dashboard,
  replaceCardModalDashCard,
  setReplaceCardModalDashCard,
}: ReplaceCardModalProps) => {
  const dispatch = useDispatch();

  const hasValidDashCard =
    !!replaceCardModalDashCard && isQuestionDashCard(replaceCardModalDashCard);

  const handleSelect = (nextCard: QuestionPickerValueItem) => {
    if (!hasValidDashCard) {
      return;
    }

    dispatch(
      replaceCard({
        dashcardId: replaceCardModalDashCard.id,
        nextCardId: nextCard.id,
      }),
    );

    dispatch(
      addUndo({
        message: getUndoReplaceCardMessage(replaceCardModalDashCard.card),
        undo: true,
        action: () =>
          dispatch(
            setDashCardAttributes({
              id: replaceCardModalDashCard.id,
              attributes: replaceCardModalDashCard,
            }),
          ),
      }),
    );
    handleClose();
  };

  const replaceCardModalRecentFilter = (items: RecentItem[]) => {
    return items.filter((item) => {
      if (isRecentCollectionItem(item) && item.dashboard) {
        if (item.dashboard.id !== dashboard.id) {
          return false;
        }
      }
      return true;
    });
  };

  const handleClose = () => {
    setReplaceCardModalDashCard(null);
  };

  if (!hasValidDashCard) {
    return null;
  }

  return (
    <QuestionPickerModal
      title={t`Pick what you want to replace this with`}
      value={
        replaceCardModalDashCard.card.id
          ? getQuestionPickerValue(replaceCardModalDashCard.card)
          : undefined
      }
      models={["card", "dataset", "metric"]}
      onChange={handleSelect}
      onClose={handleClose}
      recentFilter={replaceCardModalRecentFilter}
    />
  );
};

export const getUndoReplaceCardMessage = ({ type }: Card) => {
  if (type === "model") {
    return t`Model replaced`;
  }

  if (type === "metric") {
    return t`Metric replaced`;
  }

  if (type === "question") {
    return t`Question replaced`;
  }

  throw new Error(`Unknown card.type: ${type}`);
};
