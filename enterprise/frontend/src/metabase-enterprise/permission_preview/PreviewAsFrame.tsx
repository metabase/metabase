import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { t } from "ttag";

import { getErrorMessage } from "metabase/api/utils";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useSetting } from "metabase/settings";
import { Box, Button, Flex, Group, Icon, Stack, Text } from "metabase/ui";
import { getSubpathSafeUrl } from "metabase/urls";
import {
  type HostBrokerOptions,
  installHostBroker,
} from "metabase-enterprise/data-apps/broker/host-broker";

import {
  type PreviewGrantResponse,
  type StartPreviewRequest,
  useIssuePreviewGrantMutation,
} from "./api";

/** A grant this close to its expiry is replaced before the next request. */
const GRANT_REFRESH_MARGIN_SECONDS = 60;

// eslint-disable-next-line metabase/no-literal-metabase-strings -- header name
const GRANT_HEADER = "X-Metabase-Preview-Grant";

/** The SDK's usage telemetry: an admin's preview isn't SDK usage, so it isn't sent. */
const TELEMETRY_PATHS = new Set([
  "/api/analytics-proxy",
  "/api/metaplow-proxy",
]);

type PreviewAsFrameProps = {
  request: StartPreviewRequest;
  onSwitch: () => void;
  onExit: () => void;
};

/**
 * One previewed person: fetches a preview grant, shows whom the admin previews as, and frames the preview document on
 * the isolated origin. Its broker stamps the grant and no `X-Metabase-Client`, so requests run as that person and
 * aren't confined to a data app. Mount it with a `key` per person: a new person must get a new frame and port.
 */
export function PreviewAsFrame({
  request,
  onSwitch,
  onExit,
}: PreviewAsFrameProps) {
  const isolatedOrigin = useSetting("isolated-origin");
  const [issueGrant, { error }] = useIssuePreviewGrantMutation();
  const [grant, setGrant] = useState<PreviewGrantResponse | null>(null);
  const grantRef = useRef<Promise<PreviewGrantResponse> | null>(null);

  const fetchGrant = useCallback(() => {
    grantRef.current = issueGrant(request).unwrap();
    grantRef.current.then(setGrant, () => undefined);
    return grantRef.current;
  }, [issueGrant, request]);

  useEffect(() => {
    fetchGrant();
  }, [fetchGrant]);

  const brokerOptions: HostBrokerOptions = useMemo(
    () => ({
      stampHeaders: async () => {
        const current = await (grantRef.current ?? fetchGrant());
        const isExpiring =
          current.expires_at - Date.now() / 1000 < GRANT_REFRESH_MARGIN_SECONDS;
        const fresh = isExpiring ? await fetchGrant() : current;
        return { [GRANT_HEADER]: fresh.grant };
      },
      isDropped: (pathname) => TELEMETRY_PATHS.has(pathname),
    }),
    [fetchGrant],
  );

  let content: ReactNode;
  if (isolatedOrigin == null) {
    content = (
      <Text p="lg">{t`Previewing in a frame needs MB_ISOLATED_ORIGIN to be set.`}</Text>
    );
  } else if (error) {
    content = (
      <Text p="lg" c="feedback-negative">
        {getErrorMessage(error)}
      </Text>
    );
  } else if (grant) {
    content = (
      <PreviewIframe
        src={`${isolatedOrigin}${getSubpathSafeUrl(
          `/embed/permission-preview/${request.type}-${request.id}`,
        )}`}
        frameOrigin={isolatedOrigin}
        title={getPreviewTitle(grant)}
        brokerOptions={brokerOptions}
      />
    );
  } else {
    content = <LoadingAndErrorWrapper loading />;
  }

  return (
    <Stack gap={0} h="100%">
      <Flex
        px="lg"
        py="sm"
        align="center"
        justify="space-between"
        bg="background_page-secondary"
        style={{ borderBottom: "1px solid var(--mb-color-border)" }}
      >
        <Group gap="sm">
          <Icon name="eye" />
          <Text fw="bold">
            {grant ? getPreviewTitle(grant) : t`Starting the preview…`}
          </Text>
        </Group>
        <Group gap="sm">
          <Button onClick={onSwitch}>{t`Preview someone else`}</Button>
          <Button variant="filled" onClick={onExit}>{t`Exit preview`}</Button>
        </Group>
      </Flex>
      <Box flex={1} mih={0}>
        {content}
      </Box>
    </Stack>
  );
}

function getPreviewTitle({ user_name, principal_name }: PreviewGrantResponse) {
  return user_name === principal_name
    ? t`Previewing as ${user_name}`
    : t`Previewing as ${principal_name} (${user_name})`;
}

type PreviewIframeProps = {
  src: string;
  frameOrigin: string;
  title: string;
  brokerOptions: HostBrokerOptions;
};

function PreviewIframe({
  src,
  frameOrigin,
  title,
  brokerOptions,
}: PreviewIframeProps) {
  const [iframe, setIframe] = useState<HTMLIFrameElement | null>(null);

  useEffect(() => {
    if (!iframe) {
      return undefined;
    }
    return installHostBroker(iframe, frameOrigin, brokerOptions);
  }, [iframe, frameOrigin, brokerOptions]);

  return (
    <iframe
      ref={setIframe}
      title={title}
      src={src}
      sandbox="allow-scripts allow-same-origin allow-downloads allow-forms allow-modals allow-popups"
      style={{ display: "block", width: "100%", height: "100%", border: 0 }}
    />
  );
}
