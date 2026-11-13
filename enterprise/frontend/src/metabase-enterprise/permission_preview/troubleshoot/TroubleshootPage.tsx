import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t } from "ttag";

import { PermissionsEditorEmptyState } from "metabase/admin/permissions/components/PermissionsEditor";
import { PermissionsPageLayout } from "metabase/admin/permissions/components/PermissionsPageLayout";
import { skipToken } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { getPermissionsBasePath } from "metabase/common/components/PermissionsBasePath/base-path";
import { useNavigate, useParams } from "metabase/router";
import {
  Box,
  Button,
  Flex,
  Group,
  Icon,
  Loader,
  SegmentedControl,
  Text,
} from "metabase/ui";

import {
  type PreviewSessionResponse,
  type Principal,
  type PrincipalType,
  type StartPreviewRequest,
  type StartPreviewResponse,
  useEndPreviewMutation,
  useGetAffectingAttributesQuery,
  useStartPreviewMutation,
  useStartPreviewSessionMutation,
} from "../api";
import { getFramePath, getFramePreviewUrl } from "../preview-state";
import { PreviewSidebar } from "../preview/PreviewSidebar";
import { WhySidesheet } from "../preview/WhySidesheet";
import {
  type PreviewRouteParams,
  parsePrincipal,
  parsePrincipalType,
} from "../preview/urls";

import { AttributesPanel } from "./AttributesPanel";
import {
  ContentPreviewFrame,
  getContentFrameSource,
} from "./ContentPreviewFrame";
import { LinkBar } from "./LinkBar";
import { parseOpenedItem } from "./item-path";
import { useWhyTarget } from "./use-why-target";

const START_PATH = "/collection/root";
const FRAME_POLL_INTERVAL_MS = 500;

/** How the frame loads the app as the previewed person: its address, and the key that remounts it. */
export type GetFrameSource = (options: {
  path: string;
  preview: StartPreviewResponse;
  principal: Principal;
}) => { src: string; key: string };

/** The full app previewing through the request header, or only the item with the SDK and a preview session. */
type FrameMode = "app" | "content";

/**
 * Admin › Permissions › Troubleshoot: pick a user, group or tenant, and the app runs as them,
 * read-only, in a frame; a pasted link opens there and stays open while the admin switches person.
 */
export function TroubleshootPage() {
  const params = useParams<PreviewRouteParams>();
  const navigate = useNavigate();
  const principalType = parsePrincipalType(params);
  const principal = parsePrincipal(params);
  const [pickedValues, setPickedValues] = useState<Record<string, string>>({});
  const [openedPath, setOpenedPath] = useState(START_PATH);
  const [openCount, setOpenCount] = useState(0);
  const [framePath, setFramePath] = useState(START_PATH);
  const [isWhyOpen, setIsWhyOpen] = useState(false);
  const [frameMode, setFrameMode] = useState<FrameMode>("app");
  const [restartCount, setRestartCount] = useState(0);

  const request = usePreviewRequest(principal, pickedValues);
  const { preview, error } = usePreviewSession(
    request,
    frameMode,
    restartCount,
  );

  const openedItem = parseOpenedItem(framePath);
  const { data: attributes = [], isFetching: isLoadingAttributes } =
    useGetAffectingAttributesQuery(
      principal != null
        ? {
            principal,
            cardId: openedItem?.type === "card" ? openedItem.id : undefined,
            dashboardId:
              openedItem?.type === "dashboard" ? openedItem.id : undefined,
          }
        : skipToken,
    );
  const whyTarget = useWhyTarget(principal, openedItem, attributes);

  // The person changes, the open item stays.
  const keepFramePath = () => setOpenedPath(framePath);

  const handlePrincipalChange = (newPrincipal: Principal) => {
    keepFramePath();
    setPickedValues({});
    navigate(getTroubleshootUrl(newPrincipal));
  };

  const handleOpen = (path: string) => {
    setOpenedPath(path);
    setFramePath(path);
    setOpenCount((count) => count + 1);
  };

  const handleFrameModeChange = (mode: FrameMode) => {
    keepFramePath();
    setFrameMode(mode);
  };

  const handleContentFrameRestart = () => {
    keepFramePath();
    setRestartCount((count) => count + 1);
  };

  const whoName = getWhoName(principalType, preview);
  // by the session the frame got, not the switch: the switch changes first, the session follows
  const getFrameSource =
    preview != null && "session_token" in preview
      ? getContentFrameSource
      : getSameOriginFrameSource;
  const frameSource =
    preview != null && principal != null
      ? getFrameSource({ path: openedPath, preview, principal })
      : null;
  const frameTitle = t`What ${whoName} sees`;

  return (
    <PermissionsPageLayout tab="troubleshoot">
      <Flex
        direction="column"
        w="18.75rem"
        style={{
          flexShrink: 0,
          borderRight: "1px solid var(--mb-color-border-neutral)",
        }}
      >
        <Flex flex={1} mih={0}>
          <PreviewSidebar
            principalType={principalType}
            principal={principal}
            onPrincipalTypeChange={(type) =>
              navigate(getTroubleshootUrl({ type }))
            }
            onPrincipalChange={handlePrincipalChange}
          />
        </Flex>
        {principal != null && (
          <Box
            mah="50%"
            style={{
              overflowY: "auto",
              borderTop: "1px solid var(--mb-color-border-neutral)",
            }}
          >
            <AttributesPanel
              key={`${principal.type}-${principal.id}`}
              principalType={principalType}
              whoName={whoName}
              attributes={attributes}
              isNarrowed={
                openedItem?.type === "card" || openedItem?.type === "dashboard"
              }
              isLoading={isLoadingAttributes}
              pickedValues={pickedValues}
              onPick={(attribute, value) => {
                keepFramePath();
                setPickedValues((values) => ({
                  ...values,
                  [attribute]: value,
                }));
              }}
            />
          </Box>
        )}
      </Flex>
      {principal == null ? (
        <PermissionsEditorEmptyState
          icon="eye"
          message={t`Select a user, a group or a tenant to see the app as them`}
        />
      ) : (
        <Flex direction="column" flex={1} miw={0} p="md" gap="sm">
          <Group
            role="status"
            aria-label={t`Viewing as`}
            bg="feedback-warning"
            px="md"
            py="sm"
            gap="md"
            wrap="nowrap"
            style={{ borderRadius: "var(--mantine-radius-md)" }}
          >
            <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
              <Icon name="eye" c="text-primary" />
              <Text fw="bold" c="text-primary">
                {preview != null
                  ? t`Viewing as ${whoName} · Read-only · Audited`
                  : t`Starting the preview…`}
              </Text>
            </Group>
            <LinkBar framePath={framePath} onOpen={handleOpen} />
            {openedItem != null && (
              <Button
                size="compact-sm"
                variant="subtle"
                disabled={whyTarget == null}
                onClick={() => setIsWhyOpen(true)}
              >
                {t`Why?`}
              </Button>
            )}
            <SegmentedControl
              ml="auto"
              style={{ flexShrink: 0 }}
              aria-label={t`Frame mode`}
              value={frameMode}
              data={[
                { value: "app", label: t`Full app (header)` },
                { value: "content", label: t`Content only (SDK)` },
              ]}
              onChange={handleFrameModeChange}
            />
          </Group>
          {error != null && (
            <Text c="feedback-negative">{getErrorMessage(error)}</Text>
          )}
          <Box
            flex={1}
            mih={0}
            pos="relative"
            style={{
              border: "4px double var(--mb-color-border-strong)",
              borderRadius: "var(--mantine-radius-md)",
              overflow: "hidden",
            }}
          >
            {preview == null ? (
              <Flex h="100%" align="center" justify="center">
                <Loader />
              </Flex>
            ) : "session_token" in preview ? (
              <ContentPreviewFrame
                key={`${frameSource?.key}-${openCount}`}
                title={frameTitle}
                src={frameSource?.src ?? "about:blank"}
                sessionToken={preview.session_token}
                onPathChange={setFramePath}
                onRestart={handleContentFrameRestart}
              />
            ) : (
              <PreviewFrame
                key={`${frameSource?.key}-${openCount}`}
                title={frameTitle}
                src={frameSource?.src ?? "about:blank"}
                onPathChange={setFramePath}
              />
            )}
          </Box>
        </Flex>
      )}
      <WhySidesheet
        target={isWhyOpen ? whyTarget : null}
        onClose={() => setIsWhyOpen(false)}
      />
    </PermissionsPageLayout>
  );
}

/** The app on this origin, previewing through the request header (frame mode in `preview-state.ts`). */
function getSameOriginFrameSource({
  path,
  preview,
  principal,
}: Parameters<GetFrameSource>[0]): ReturnType<GetFrameSource> {
  return {
    key: `${preview.user_id}-${JSON.stringify(preview.attributes)}`,
    src: getFramePreviewUrl(path, {
      userId: preview.user_id,
      userName: preview.user_name,
      principalType: principal.type,
      principalId: principal.id,
      principalName: preview.principal_name,
      attributes: preview.attributes,
      returnPath: "/",
    }),
  };
}

function getTroubleshootUrl(principal: Principal | { type: PrincipalType }) {
  const base = `${getPermissionsBasePath()}/troubleshoot`;
  return "id" in principal
    ? `${base}/${principal.type}/${principal.id}`
    : `${base}/${principal.type}`;
}

function getWhoName(
  principalType: PrincipalType,
  preview: StartPreviewResponse | null,
) {
  if (preview == null) {
    return "";
  }
  switch (principalType) {
    case "user":
      return preview.user_name;
    case "group":
      return t`a member of ${preview.principal_name}`;
    case "tenant":
      return t`a user of ${preview.principal_name}`;
  }
}

/** The preview to start: the same object while the person and the picked values stay the same. */
function usePreviewRequest(
  principal: Principal | null,
  pickedValues: Record<string, string>,
): StartPreviewRequest | null {
  const type = principal?.type;
  const id = principal?.id;
  return useMemo(
    () =>
      type != null && id != null
        ? {
            type,
            id,
            attributes: type === "user" ? undefined : pickedValues,
          }
        : null,
    [type, id, pickedValues],
  );
}

/**
 * Starts the preview through the admin's own session (in content mode, with a session of the person's own), and ends
 * it when the person, values or mode change, the content frame restarts, or the page closes.
 */
function usePreviewSession(
  request: StartPreviewRequest | null,
  frameMode: FrameMode,
  restartCount: number,
) {
  const [startPreview] = useStartPreviewMutation();
  const [startPreviewSession] = useStartPreviewSessionMutation();
  const [endPreview] = useEndPreviewMutation();
  const [preview, setPreview] = useState<
    StartPreviewResponse | PreviewSessionResponse | null
  >(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    setPreview(null);
    setError(null);
    if (request == null) {
      return;
    }
    let isCurrent = true;
    let started: StartPreviewResponse | PreviewSessionResponse | null = null;
    const start = frameMode === "content" ? startPreviewSession : startPreview;
    start(request)
      .unwrap()
      .then((response) => {
        started = response;
        if (isCurrent) {
          setPreview(response);
        } else {
          endPreview({ request, preview: response });
        }
      })
      .catch((startError: unknown) => isCurrent && setError(startError));
    return () => {
      isCurrent = false;
      if (started != null) {
        endPreview({ request, preview: started });
      }
    };
  }, [
    request,
    frameMode,
    restartCount,
    startPreview,
    startPreviewSession,
    endPreview,
  ]);

  return { preview, error };
}

type PreviewFrameProps = {
  title: string;
  src: string;
  onPathChange: (path: string) => void;
};

/** The app as the previewed person; reports where it navigates, read through the same origin. */
function PreviewFrame({ title, src, onPathChange }: PreviewFrameProps) {
  const ref = useRef<HTMLIFrameElement>(null);
  const reportPath = useCallback(() => {
    const location = ref.current?.contentWindow?.location;
    const path = location != null ? getFramePath(location) : null;
    if (path != null && location?.href !== "about:blank") {
      onPathChange(path);
    }
  }, [onPathChange]);

  useEffect(() => {
    // in-app navigation fires no event the host can hear
    const interval = window.setInterval(reportPath, FRAME_POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [reportPath]);

  return (
    <Box
      component="iframe"
      ref={ref}
      title={title}
      src={src}
      onLoad={reportPath}
      w="100%"
      h="100%"
      display="block"
      style={{ border: 0 }}
    />
  );
}
