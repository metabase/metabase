// import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";
import { t } from "ttag";

import { Modal } from "metabase/ui";
import { DashboardChartSettings } from "metabase/visualizations/components/ChartSettings";
import { VisualizerModal } from "metabase/visualizer/components/VisualizerModal";
import type {
  Dashboard,
  DashboardCard,
  Series,
  VisualizationSettings,
} from "metabase-types/api";

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

      {isVisualizerModalOpen && (
        <VisualizerModal
          onSave={() => alert("Do a thing")}
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
