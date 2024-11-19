import { useCallback, useMemo } from "react";
import { jt, t } from "ttag";
import _ from "underscore";

import { useDocsUrl, useSetting } from "metabase/common/hooks";
import ExternalLink from "metabase/core/components/ExternalLink";
import Link from "metabase/core/components/Link";
import CS from "metabase/css/core/index.css";
import { useSelector } from "metabase/lib/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Box, Button, Group, Icon, Stack, Text } from "metabase/ui";
import type {
  Dashboard,
  VirtualDashboardCard,
  VisualizationSettings,
} from "metabase-types/api";

import {
  IFrameEditWrapper,
  IFrameWrapper,
  InteractiveText,
  StyledInput,
} from "./IFrameViz.styled";
import { settings } from "./IFrameVizSettings";
import { getIframeUrl, isAllowedIframeUrl } from "./utils";

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

  const allowedHosts = useSetting("allowed-iframe-hosts");
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
          <Group align="center" noWrap>
            <Text fw="bold" truncate>
              {t`Paste your snippet here`}
            </Text>{" "}
            <Box ml="auto">
              <Button
                compact
                variant="filled"
                style={{ pointerEvents: "all" }}
                onClick={onTogglePreviewing}
                onMouseDown={e => e.stopPropagation()}
              >{t`Done`}</Button>
            </Box>
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

  const hasAllowedIFrameUrl =
    iframeUrl && isAllowedIframeUrl(iframeUrl, allowedHosts);
  const hasForbiddenIFrameUrl =
    iframeUrl && !isAllowedIframeUrl(iframeUrl, allowedHosts);

  const renderError = () => {
    if (hasForbiddenIFrameUrl && isEditing) {
      return <ForbiddenDomainError url={iframeUrl} />;
    }
    return <GenericError />;
  };

  return (
    <IFrameWrapper data-testid="iframe-card" fade={isEditingParameter}>
      {hasAllowedIFrameUrl ? (
        <iframe
          data-testid="iframe-visualization"
          src={iframeUrl}
          width={width}
          height={height}
          frameBorder={0}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />
      ) : (
        renderError()
      )}
    </IFrameWrapper>
  );
}

function ForbiddenDomainError({ url }: { url: string }) {
  const isAdmin = useSelector(getUserIsAdmin);
  const { url: docsUrl, showMetabaseLinks } = useDocsUrl(
    "configuring-metabase/settings",
    { anchor: "allowed-domains-for-iframes-in-dashboards" },
  );

  const domain = useMemo(() => {
    try {
      const { hostname } = new URL(url);
      return hostname;
    } catch {
      return url;
    }
  }, [url]);

  const renderMessage = () => {
    if (isAdmin) {
      return jt`If you’re sure you trust this domain, you can add it to your ${(<Link key="link" className={CS.link} to="/admin/settings/general#allowed-iframe-hosts" target="_blank">{t`allowed domains list`}</Link>)} in admin settings.`;
    }
    return showMetabaseLinks
      ? jt`If you’re sure you trust this domain, you can ask an admin to add it to the ${(<ExternalLink key="link" className={CS.link} href={docsUrl}>{t`allowed domains list`}</ExternalLink>)}.`
      : t`If you’re sure you trust this domain, you can ask an admin to add it to the allowed domains list.`;
  };

  return (
    <Box p={12} w="100%" style={{ textAlign: "center" }}>
      <Icon name="lock" color="var(--mb-color-text-dark)" mb="s" />
      <Text color="text-dark">
        {jt`${(
          <Text key="domain" fw="bold" display="inline">
            {domain}
          </Text>
        )} can not be embedded in iframe cards.`}
      </Text>
      <InteractiveText color="text-dark" px="lg" mt="md">
        {renderMessage()}
      </InteractiveText>
    </Box>
  );
}

function GenericError() {
  return (
    <Box p={12} w="100%" style={{ textAlign: "center" }}>
      <Icon name="lock" color="var(--mb-color-text-dark)" mb="s" />
      <Text color="text-dark">
        {t`There was a problem rendering this content.`}
      </Text>
    </Box>
  );
}

Object.assign(IFrameViz, settings);
