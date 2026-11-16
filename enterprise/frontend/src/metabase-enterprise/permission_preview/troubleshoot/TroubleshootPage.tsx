import { useEffect, useMemo, useRef, useState } from "react";
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
  type PreviewCodeResponse,
  type PreviewSessionResponse,
  type Principal,
  type PrincipalType,
  type StartPreviewRequest,
  type StartPreviewResponse,
  useEndPreviewMutation,
  useGetAffectingAttributesQuery,
  useStartPreviewCodeMutation,
  useStartPreviewSessionMutation,
} from "../api";
import {
  getContentPreviewUrl,
  getPreviewHostContentUrl,
  getPreviewHostSignInUrl,
} from "../content-preview";
import { PreviewSidebar } from "../preview/PreviewSidebar";
import { WhySidesheet } from "../preview/WhySidesheet";
import {
  type PreviewRouteParams,
  parsePrincipal,
  parsePrincipalType,
} from "../preview/urls";

import { AttributesPanel } from "./AttributesPanel";
import { ContentPreviewFrame } from "./ContentPreviewFrame";
import { LinkBar } from "./LinkBar";
import { parseOpenedItem } from "./item-path";
import { useWhyTarget } from "./use-why-target";

const START_PATH = "/collection/root";

type FramePreview = PreviewSessionResponse | PreviewCodeResponse;

/**
 * How the SDK frame signs in as the person: on this origin with a session token in its memory, or on the preview host
 * with the person's own cookie.
 */
type FrameMode = "same-origin" | "subdomain";

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
  const [frameMode, setFrameMode] = useState<FrameMode>("same-origin");
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

  // the preview host's code works once: later loads of the same preview go straight to the content, with the cookie
  const signedInPreviewIdRef = useRef<string | null>(null);
  const frameSrc = useMemo(
    () =>
      preview != null
        ? getFrameSrc(preview, openedPath, signedInPreviewIdRef.current)
        : null,
    // a new address only when the frame remounts
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [preview, openCount],
  );

  const whoName = getWhoName(principalType, preview);
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
                { value: "same-origin", label: t`Same origin` },
                { value: "subdomain", label: t`Subdomain` },
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
            ) : (
              <ContentPreviewFrame
                key={`${preview.preview_id}-${openCount}`}
                title={frameTitle}
                src={frameSrc ?? "about:blank"}
                frameOrigin={
                  "preview_origin" in preview
                    ? preview.preview_origin
                    : window.location.origin
                }
                sessionToken={
                  "session_token" in preview ? preview.session_token : undefined
                }
                onPathChange={setFramePath}
                onRestart={handleContentFrameRestart}
                onLoad={() => {
                  signedInPreviewIdRef.current = preview.preview_id;
                }}
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

function getFrameSrc(
  preview: FramePreview,
  path: string,
  signedInPreviewId: string | null,
) {
  if (!("code" in preview)) {
    return getContentPreviewUrl(path);
  }
  return signedInPreviewId === preview.preview_id
    ? getPreviewHostContentUrl(preview.preview_origin, path)
    : getPreviewHostSignInUrl(preview.preview_origin, path, preview.code);
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
 * Starts the preview with a session of the person's own (a token on this origin, or a code for the preview host's
 * cookie), and ends it when the person, values or mode change, the frame restarts, or the page closes.
 */
function usePreviewSession(
  request: StartPreviewRequest | null,
  frameMode: FrameMode,
  restartCount: number,
) {
  const [startPreviewSession] = useStartPreviewSessionMutation();
  const [startPreviewCode] = useStartPreviewCodeMutation();
  const [endPreview] = useEndPreviewMutation();
  const [preview, setPreview] = useState<FramePreview | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    setPreview(null);
    setError(null);
    if (request == null) {
      return;
    }
    let isCurrent = true;
    let started: FramePreview | null = null;
    const start =
      frameMode === "subdomain" ? startPreviewCode : startPreviewSession;
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
    startPreviewSession,
    startPreviewCode,
    endPreview,
  ]);

  return { preview, error };
}
