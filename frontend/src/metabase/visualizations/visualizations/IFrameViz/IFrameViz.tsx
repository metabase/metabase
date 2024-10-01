import { useCallback, useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import { Box, Button, Group, Stack, Text } from "metabase/ui";
import type {
  Dashboard,
  VirtualDashboardCard,
  VisualizationSettings,
} from "metabase-types/api";

import {
  IFrameEditWrapper,
  IFrameWrapper,
  StyledInput,
} from "./IFrameViz.styled";
import { settings } from "./IFrameVizSettings";
import { getIframeUrl } from "./utils";

export interface IFrameVizProps {
  dashcard: VirtualDashboardCard;
  dashboard: Dashboard;
  isEditing: boolean;
  isPreviewing: boolean;
  onUpdateVisualizationSettings: (newSettings: VisualizationSettings) => void;
  settings: VisualizationSettings;
  isEditingParameter?: boolean;
  width: number;
  height: number;
  gridSize: {
    width: number;
    height: number;
  };
  onTogglePreviewing: () => void;
}

export function IFrameViz({
  dashcard,
  isEditing,
  onUpdateVisualizationSettings,
  settings,
  isEditingParameter,
  width,
  height,
  isPreviewing,
  onTogglePreviewing,
}: IFrameVizProps) {
  const { iframe: iframeOrUrl } = settings;
  const isNew = !!dashcard?.justAdded;

  const iframeUrl = useMemo(() => getIframeUrl(iframeOrUrl), [iframeOrUrl]);

  const handleIFrameChange = useCallback(
    (newIFrame: string) => {
      onUpdateVisualizationSettings({ iframe: newIFrame });
    },
    [onUpdateVisualizationSettings],
  );

  if (isEditing && !isEditingParameter && !isPreviewing) {
    return (
      <IFrameEditWrapper>
        <Stack h="100%" spacing="sm">
          <Group align="center">
            <Text fw="bold">{t`Paste your snippet here`}</Text>{" "}
            <Button
              disabled={!iframeOrUrl}
              compact
              ml="auto"
              variant="filled"
              style={{ pointerEvents: "all" }}
              onClick={onTogglePreviewing}
              onMouseDown={e => e.stopPropagation()}
            >{t`Done`}</Button>
          </Group>
          <Box h="100%">
            <StyledInput
              data-testid="iframe-card-input"
              autoFocus={isNew}
              size="100%"
              styles={{
                wrapper: {
                  height: "100%",
                },
              }}
              h="100%"
              value={iframeOrUrl ?? ""}
              placeholder={`<iframe src="https://example.com" />`}
              onChange={e => handleIFrameChange(e.target.value)}
              onMouseDown={e => e.stopPropagation()}
              style={{ pointerEvents: "all" }}
            />
          </Box>
        </Stack>
      </IFrameEditWrapper>
    );
  }

  return (
    <IFrameWrapper data-testid="iframe-card" fade={isEditingParameter}>
      {iframeUrl ? (
        <iframe
          data-testid="iframe-visualization"
          src={iframeUrl}
          width={width}
          height={height}
          frameBorder={0}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />
      ) : null}
    </IFrameWrapper>
  );
}

Object.assign(IFrameViz, settings);
