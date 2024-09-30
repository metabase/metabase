import { useCallback, useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import { Box, Button, Group, Stack, Text } from "metabase/ui";
import type {
  Dashboard,
  VirtualDashboardCard,
  VisualizationSettings,
} from "metabase-types/api";

import { EmbedEditWrapper, EmbedWrapper, StyledInput } from "./EmbedViz.styled";
import { settings } from "./EmbedVizSettings";
import { getIframeUrl } from "./utils";

export interface EmbedVizProps {
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

export function EmbedViz({
  dashcard,
  isEditing,
  onUpdateVisualizationSettings,
  settings,
  isEditingParameter,
  width,
  height,
  isPreviewing,
  onTogglePreviewing,
}: EmbedVizProps) {
  const { embed: iframeOrUrl } = settings;
  const isNew = !!dashcard?.justAdded;

  const iframeUrl = useMemo(() => getIframeUrl(iframeOrUrl), [iframeOrUrl]);

  const handleEmbedChange = useCallback(
    (newEmbed: string) => {
      onUpdateVisualizationSettings({ embed: newEmbed });
    },
    [onUpdateVisualizationSettings],
  );

  if (isEditing && !isEditingParameter && !isPreviewing) {
    return (
      <EmbedEditWrapper>
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
              data-testid="embed-card-input"
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
              onChange={e => handleEmbedChange(e.target.value)}
              onMouseDown={e => e.stopPropagation()}
              style={{ pointerEvents: "all" }}
            />
          </Box>
        </Stack>
      </EmbedEditWrapper>
    );
  }

  return (
    <EmbedWrapper data-testid="embed-card" fade={isEditingParameter}>
      {iframeUrl ? (
        <iframe src={iframeUrl} width={width} height={height} frameBorder={0} />
      ) : null}
    </EmbedWrapper>
  );
}

Object.assign(EmbedViz, settings);
