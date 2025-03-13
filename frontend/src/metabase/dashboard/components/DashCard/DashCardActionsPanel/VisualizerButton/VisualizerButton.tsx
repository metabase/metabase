import { useDisclosure } from "@mantine/hooks";
import { useMemo } from "react";
import { t } from "ttag";

import { replaceCardWithVisualization } from "metabase/dashboard/actions";
import { useDispatch } from "metabase/lib/redux";
import { VisualizerModal } from "metabase/visualizer/components/VisualizerModal";
import {
  getInitialStateForCardDataSource,
  isVisualizerDashboardCard,
} from "metabase/visualizer/utils";
import type {
  Card,
  DashboardCard,
  DatasetColumn,
  DatasetQuery,
} from "metabase-types/api";
import type { VisualizerHistoryItem } from "metabase-types/store/visualizer";

import { DashCardActionButton } from "../DashCardActionButton";

interface VisualizerButtonProps {
  card: Card<DatasetQuery>;
  dashcard: DashboardCard;
  columns: DatasetColumn[];
}

export function VisualizerButton({
  card,
  dashcard,
  columns,
}: VisualizerButtonProps) {
  const [isOpen, { open, close }] = useDisclosure(false);
  const dispatch = useDispatch();

  const initialState = useMemo(() => {
    if (isOpen) {
      if (isVisualizerDashboardCard(dashcard)) {
        return {
          state: dashcard.visualization_settings.visualization,
        };
      } else {
        return {
          state: getInitialStateForCardDataSource(card, columns),
        };
      }
    }
  }, [isOpen, dashcard, card, columns]);

  const handleChangeVisualization = (visualization: VisualizerHistoryItem) => {
    dispatch(
      replaceCardWithVisualization({
        dashcardId: dashcard.id,
        visualization,
      }),
    );
    close();
  };

  return (
    <>
      <DashCardActionButton
        as="div"
        tooltip={t`Edit visualization`}
        aria-label={t`Edit visualization`}
        onClick={open}
      >
        <DashCardActionButton.Icon name="pencil" />
      </DashCardActionButton>
      {!!initialState && (
        <VisualizerModal
          initialState={initialState}
          onSave={handleChangeVisualization}
          onClose={close}
          saveLabel={t`Save`}
        />
      )}
    </>
  );
}
