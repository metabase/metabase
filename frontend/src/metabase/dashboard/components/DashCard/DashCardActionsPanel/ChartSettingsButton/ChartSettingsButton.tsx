import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { DashboardChartSettings } from "metabase/dashboard/components/DashboardChartSettings";
import { Modal } from "metabase/ui";
import type {
  DashCardSeries,
  DashboardCard,
  Series,
  VisualizationSettings,
} from "metabase-types/api";

import { DashCardActionButton } from "../DashCardActionButton";

interface Props {
  series: DashCardSeries;
  dashcard?: DashboardCard;
  onReplaceAllVisualizationSettings: (settings: VisualizationSettings) => void;
}

export function ChartSettingsButton({
  series,
  dashcard,
  onReplaceAllVisualizationSettings,
}: Props) {
  const [isOpened, { open, close }] = useDisclosure(false);

  return (
    <>
      <DashCardActionButton
        tooltip={t`Visualization options`}
        aria-label={t`Show visualization options`}
        onClick={open}
      >
        <DashCardActionButton.Icon name="palette" />
      </DashCardActionButton>

      <Modal
        opened={isOpened}
        onClose={close}
        size="95%"
        padding={0}
        withCloseButton={false}
        styles={{
          body: {
            height: "100%",
          },
          content: {
            height: "85%",
            overflowY: "hidden",
          },
        }}
      >
        <DashboardChartSettings
          // TODO: all of the settings code assumes we have a Series with a non-optional `data` property
          // but that's not true - virtual dashcards don't have data, so this needs to be fixed
          series={series as Series}
          onChange={onReplaceAllVisualizationSettings}
          dashcard={dashcard}
          onClose={close}
        />
      </Modal>
    </>
  );
}
