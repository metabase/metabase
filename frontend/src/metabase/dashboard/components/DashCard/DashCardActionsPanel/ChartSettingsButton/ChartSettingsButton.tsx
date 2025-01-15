// import { useDisclosure } from "@mantine/hooks";
import { useMemo, useState } from "react";
import { t } from "ttag";

import { replaceCardWithVisualization } from "metabase/dashboard/actions";
import { useDispatch } from "metabase/lib/redux";
import { Modal } from "metabase/ui";
import { DashboardChartSettings } from "metabase/visualizations/components/ChartSettings";
import { VisualizerModal } from "metabase/visualizer/components/VisualizerModal";
import { getInitialStateForCardDataSource } from "metabase/visualizer/utils";
import type {
  Dashboard,
  DashboardCard,
  Series,
  VisualizationSettings,
} from "metabase-types/api";
import type { VisualizerHistoryItem } from "metabase-types/store/visualizer";

import { DashCardActionButton } from "../DashCardActionButton";

interface Props {
  series: Series;
  dashboard: Dashboard;
  dashcard?: DashboardCard;
  onReplaceAllVisualizationSettings: (settings: VisualizationSettings) => void;
}

export function ChartSettingsButton({
  series,
  dashboard,
  dashcard,
  onReplaceAllVisualizationSettings,
}: Props) {
  // const [isOpened, { open, close }] = useDisclosure(false);
  const [isVisualizerModalOpen, setVisualizerModalOpen] = useState(false);
  const dispatch = useDispatch();

  const visualizerInitialState = useMemo(() => {
    if (isVisualizerModalOpen) {
      if (dashcard?.visualization_settings?.visualization) {
        return dashcard?.visualization_settings?.visualization;
      } else {
        return getInitialStateForCardDataSource(series[0].card, series[0]);
      }
    }
  }, [isVisualizerModalOpen, dashcard, series]);

  const handleChangeVisualization = (visualization: VisualizerHistoryItem) => {
    if (dashcard) {
      dispatch(
        replaceCardWithVisualization({
          dashcardId: dashcard.id,
          visualization,
        }),
      );
      setVisualizerModalOpen(false);
    }
  };

  return (
    <>
      <DashCardActionButton
        as="div"
        tooltip={t`Edit card`}
        aria-label={t`Edit dash card`}
        onClick={() => setVisualizerModalOpen(true)}
      >
        <DashCardActionButton.Icon name="pencil" />
      </DashCardActionButton>

      {!!visualizerInitialState && (
        <VisualizerModal
          initialState={{ state: visualizerInitialState }}
          onSave={handleChangeVisualization}
          onClose={() => setVisualizerModalOpen(false)}
        />
      )}

      {/*
        <Modal.Root opened={isOpened} onClose={close} size="85%">
          <Modal.Overlay />
          <Modal.Content mih="85%">
            <Modal.Body>
              <DashboardChartSettings
                series={series}
                onChange={onReplaceAllVisualizationSettings}
                dashboard={dashboard}
                dashcard={dashcard}
                onClose={close}
              />
            </Modal.Body>
          </Modal.Content>
        </Modal.Root>
        */}
    </>
  );
}
