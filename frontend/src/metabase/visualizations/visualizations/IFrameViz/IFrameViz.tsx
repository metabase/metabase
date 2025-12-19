import { useCallback, useMemo } from "react";
import { jt, t } from "ttag";

import ExternalLink from "metabase/common/components/ExternalLink";
import Link from "metabase/common/components/Link";
import { useDocsUrl, useSetting } from "metabase/common/hooks";
import CS from "metabase/css/core/index.css";
import { getParameterValues } from "metabase/dashboard/selectors";
import { useSelector } from "metabase/lib/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Box, Button, Group, Icon, Stack, Text } from "metabase/ui";
import { fillParametersInText } from "metabase/visualizations/shared/utils/parameter-substitution";
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
import { getAllowedIframeAttributes, isAllowedIframeUrl } from "./utils";

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
  dashboard,
  isEditing,
  onUpdateVisualizationSettings,
  settings,
  isEditingParameter,
  width,
  height,
  isPreviewing,
  onTogglePreviewing,
}: IFrameVizProps) {
  const parameterValues = useSelector(getParameterValues);
  const { iframe: iframeOrUrl } = settings;
  const isNew = !!dashcard?.justAdded;

  const allowedHosts = useSetting("allowed-iframe-hosts");
  const allowedIframeAttributes = useMemo(
    () => getAllowedIframeAttributes(iframeOrUrl),
    [iframeOrUrl],
  );

  const handleIFrameChange = useCallback(
    (newIFrame: string) => {
      onUpdateVisualizationSettings({ iframe: newIFrame });
    },
    [onUpdateVisualizationSettings],
  );

  const interpolatedSrc = useMemo(
    () =>
      fillParametersInText({
        dashcard,
        dashboard,
        parameterValues,
        text: allowedIframeAttributes?.src,
        urlEncode: true,
      }),
    [dashcard, dashboard, parameterValues, allowedIframeAttributes?.src],
  );

  if (isEditing && !isEditingParameter && !isPreviewing) {
    return (
      <IFrameEditWrapper>
        <Stack h="100%" gap="sm">
          <Group align="center" wrap="nowrap">
            <Text fw="bold" truncate>
              {t`Paste your snippet here`}
            </Text>{" "}
            <Box ml="auto">
              <Button
                size="compact-md"
                variant="filled"
                style={{ pointerEvents: "all" }}
                onClick={onTogglePreviewing}
                onMouseDown={(e) => e.stopPropagation()}
              >{t`Done`}</Button>
            </Box>
          </Group>
          <Box h="100%">
            <StyledInput
              data-testid="iframe-card-input"
              autoFocus={isNew}
              styles={{
                wrapper: {
                  height: "100%",
                },
              }}
              h="100%"
              value={iframeOrUrl ?? ""}
              placeholder={`<iframe src="https://example.com" />`}
              onChange={(e) => handleIFrameChange(e.target.value)}
              onMouseDown={(e) => e.stopPropagation()}
              style={{ pointerEvents: "all" }}
            />
          </Box>
        </Stack>
      </IFrameEditWrapper>
    );
  }

  const hasAllowedIFrameUrl =
    interpolatedSrc && isAllowedIframeUrl(interpolatedSrc, allowedHosts);
  const hasForbiddenIFrameUrl =
    interpolatedSrc && !isAllowedIframeUrl(interpolatedSrc, allowedHosts);

  const renderError = () => {
    if (hasForbiddenIFrameUrl && isEditing) {
      return <ForbiddenDomainError url={interpolatedSrc} />;
    }
    return <GenericError />;
  };

  return (
    <IFrameWrapper data-testid="iframe-card" fade={isEditingParameter}>
      {hasAllowedIFrameUrl ? (
        <iframe
          data-testid="iframe-visualization"
          width={width}
          height={height}
          frameBorder={0}
          sandbox="allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation allow-same-origin allow-scripts"
          referrerPolicy="strict-origin-when-cross-origin"
          {...allowedIframeAttributes}
          src={interpolatedSrc}
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
      <Icon name="lock" c="text-primary" mb="s" />
      <Text c="text-primary">
        {jt`${(
          <Text key="domain" fw="bold" display="inline">
            {domain}
          </Text>
        )} can not be embedded in iframe cards.`}
      </Text>
      <InteractiveText c="text-primary" px="lg" mt="md">
        {renderMessage()}
      </InteractiveText>
    </Box>
  );
}

function GenericError() {
  return (
    <Box p={12} w="100%" style={{ textAlign: "center" }}>
      <Icon name="lock" c="text-primary" mb="s" />
      <Text color="text-primary">
        {t`There was a problem rendering this content.`}
      </Text>
    </Box>
  );
}

Object.assign(IFrameViz, settings);
