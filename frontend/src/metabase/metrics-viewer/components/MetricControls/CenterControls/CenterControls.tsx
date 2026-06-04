import { type ComponentProps, useMemo, useState } from "react";
import { t } from "ttag";

import { useMetricsViewerContext } from "metabase/metrics-viewer/context";
import { getProjectionInfo } from "metabase/metrics-viewer/utils";
import { Box, Button, Icon, Popover } from "metabase/ui";

import S from "./CenterControls.module.css";
import { ControlsContent } from "./components/ControlsContent";
import { NoBreakoutControls } from "./components/NoBreakoutControls";
import { useProjectionControlsVisibility } from "./hooks/useProjectionControlsVisibility";

type CenterControlsProps = Pick<
  ComponentProps<typeof ControlsContent>,
  "canToggleColumnLabels" | "definition" | "allFilterDimensions"
>;

export function CenterControls(props: CenterControlsProps) {
  const { definition } = props;
  const [isXAxisPopoverOpen, setIsXAxisPopoverOpen] = useState(false);
  const { activeDimensionBreakout: dimensionBreakout } =
    useMetricsViewerContext();
  const projectionInfo = useMemo(
    () => getProjectionInfo(definition),
    [definition],
  );
  const { hasCenterControls } = useProjectionControlsVisibility(projectionInfo);

  if (!dimensionBreakout) {
    return null;
  }

  if (dimensionBreakout.type === "scalar") {
    return <NoBreakoutControls />;
  }

  if (!hasCenterControls) {
    return null;
  }

  return (
    <>
      <Box className={S.centerCluster}>
        <ControlsContent
          dimensionBreakout={dimensionBreakout}
          setIsXAxisPopoverOpen={setIsXAxisPopoverOpen}
          variant="floating"
          {...props}
        />
      </Box>
      <Box className={S.compactCenterControls}>
        <Popover
          onChange={setIsXAxisPopoverOpen}
          opened={isXAxisPopoverOpen}
          position="top"
          shadow="md"
          withinPortal
        >
          <Popover.Target>
            <Button
              className={S.xAxisButton}
              aria-label={t`X-axis controls`}
              variant="subtle"
              color="text-primary"
              leftSection={<Icon name="gear" size={16} />}
              onClick={() => setIsXAxisPopoverOpen(!isXAxisPopoverOpen)}
              data-testid="metrics-viewer-x-axis-controls"
            >
              {t`X-axis`}
            </Button>
          </Popover.Target>
          <Popover.Dropdown
            className={S.centerControlsPopoverDropdown}
            p="md"
            bg="background-primary"
          >
            <ControlsContent
              dimensionBreakout={dimensionBreakout}
              setIsXAxisPopoverOpen={setIsXAxisPopoverOpen}
              variant="inline"
              {...props}
            />
          </Popover.Dropdown>
        </Popover>
      </Box>
    </>
  );
}
