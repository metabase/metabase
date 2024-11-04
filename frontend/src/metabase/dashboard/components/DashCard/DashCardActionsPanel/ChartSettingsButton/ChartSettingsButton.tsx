import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { DEFAULT_Z_INDEX } from "metabase/components/Popover/constants";
import { Modal } from "metabase/ui";
import { DashboardChartSettings } from "metabase/visualizations/components/ChartSettings";
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
  const [isOpened, { open, close }] = useDisclosure(false);

  return (
    <>
      <DashCardActionButton
        as="div"
        tooltip={t`Visualization options`}
        aria-label={t`Show visualization options`}
        onClick={open}
      >
        <DashCardActionButton.Icon name="palette" />
      </DashCardActionButton>

      {/* zIndex is a hack for now until the inner popovers are converted to mantine */}
      <Modal.Root
        opened={isOpened}
        onClose={close}
        size="85%"
        zIndex={DEFAULT_Z_INDEX - 1}
      >
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
    </>
  );
}
