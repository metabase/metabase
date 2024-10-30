import { useDisclosure } from "@mantine/hooks";

import { DEFAULT_Z_INDEX } from "metabase/components/Popover/constants";
import { Box, Popover } from "metabase/ui";
import type { Widget } from "metabase/visualizations/components/ChartSettings/types";
import ChartSettingsWidget, {
  type ChartSettingsWidgetProps,
} from "metabase/visualizations/components/ChartSettingsWidget";
import ChartSettingsWidgetPopover from "metabase/visualizations/components/ChartSettingsWidgetPopover";

export const ChartSettingsSidebarWidget = ({
  styleWidget,
  formattingWidget,
  onShowWidget,
  onEndShowWidget,
  ...chartSettingsWidgetProps
}: ChartSettingsWidgetProps & {
  styleWidget?: Widget | null;
  formattingWidget?: Widget | null;
}) => {
  const [isPopoverOpen, { open, close }] = useDisclosure();
  return (
    <Popover
      opened={isPopoverOpen}
      onClose={() => {
        onEndShowWidget();
        close();
      }}
      position="right"
      offset={0}
      zIndex={DEFAULT_Z_INDEX}
    >
      <Popover.Target>
        <Box>
          <ChartSettingsWidget
            {...chartSettingsWidgetProps}
            onShowWidget={(widget: Widget) => {
              onShowWidget(widget);
              open();
            }}
            onEndShowWidget={() => {
              onEndShowWidget();
              close();
            }}
          />
        </Box>
      </Popover.Target>
      <Popover.Dropdown>
        <ChartSettingsWidgetPopover
          widgets={[styleWidget, formattingWidget].filter(
            (widget): widget is Widget => !!widget,
          )}
          handleEndShowWidget={() => {
            onEndShowWidget();
            close();
          }}
        />
      </Popover.Dropdown>
    </Popover>
  );
};
