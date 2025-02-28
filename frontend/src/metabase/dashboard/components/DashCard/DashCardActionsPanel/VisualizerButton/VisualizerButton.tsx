import { useDisclosure } from "@mantine/hooks";
import { useMemo } from "react";
import { t } from "ttag";

import { replaceCardWithVisualization } from "metabase/dashboard/actions";
import { useDispatch } from "metabase/lib/redux";
import { VisualizerModal } from "metabase/visualizer/components/VisualizerModal";
import { getInitialStateForCardDataSource } from "metabase/visualizer/utils";
import type { DashboardCard, Series } from "metabase-types/api";
import type { VisualizerHistoryItem } from "metabase-types/store/visualizer";

import { DashCardActionButton } from "../DashCardActionButton";

interface VisualizerButtonProps {
  series: Series;
  dashcard: DashboardCard;
}

export function VisualizerButton({ series, dashcard }: VisualizerButtonProps) {
  const [isOpen, { open, close }] = useDisclosure(false);
  const dispatch = useDispatch();

  const initialState = useMemo(() => {
    if (isOpen) {
      if (dashcard?.visualization_settings?.visualization) {
        return {
          state: dashcard?.visualization_settings?.visualization,
        };
      } else {
        return {
          state: getInitialStateForCardDataSource(series[0]),
        };
      }
    }
  }, [isOpen, dashcard, series]);

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
