import cx from "classnames";

import Modal from "metabase/components/Modal";
import ModalS from "metabase/css/components/modal.module.css";
import DashboardS from "metabase/css/dashboard.module.css";
import { isQuestionDashCard } from "metabase/dashboard/utils";
import type {
  BaseDashboardCard,
  Card,
  DashCardDataMap,
  DashCardId,
  QuestionDashboardCard,
} from "metabase-types/api";

import { AddSeriesModal } from "../AddSeriesModal/AddSeriesModal";

type AddSeriesModalWrapperProps = {
  addSeriesModalDashCard: BaseDashboardCard | null;
  setAddSeriesModalDashCard: (card: BaseDashboardCard | null) => void;
  dashcardData: DashCardDataMap;
  fetchCardData: (
    card: Card,
    dashcard: QuestionDashboardCard,
    options: {
      clearCache?: boolean;
      ignoreCache?: boolean;
      reload?: boolean;
    },
  ) => Promise<void>;
  setDashCardAttributes: (options: {
    id: DashCardId;
    attributes: Partial<QuestionDashboardCard>;
  }) => void;
};

export const AddSeriesModalWrapper = ({
  addSeriesModalDashCard,
  dashcardData,
  fetchCardData,
  setDashCardAttributes,
  setAddSeriesModalDashCard,
}: AddSeriesModalWrapperProps) => {
  const isOpen =
    !!addSeriesModalDashCard && isQuestionDashCard(addSeriesModalDashCard);

  return (
    <Modal
      className={cx(ModalS.Modal, DashboardS.Modal, DashboardS.AddSeriesModal)}
      data-testid="add-series-modal"
      isOpen={isOpen}
    >
      {isOpen && (
        <AddSeriesModal
          dashcard={addSeriesModalDashCard}
          dashcardData={dashcardData}
          fetchCardData={fetchCardData}
          setDashCardAttributes={setDashCardAttributes}
          onClose={() => setAddSeriesModalDashCard(null)}
        />
      )}
    </Modal>
  );
};
