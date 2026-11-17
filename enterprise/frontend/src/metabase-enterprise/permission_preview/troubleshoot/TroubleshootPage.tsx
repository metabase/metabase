import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import { PermissionsEditorEmptyState } from "metabase/admin/permissions/components/PermissionsEditor";
import { PermissionsPageLayout } from "metabase/admin/permissions/components/PermissionsPageLayout";
import { skipToken } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { getPermissionsBasePath } from "metabase/common/components/PermissionsBasePath/base-path";
import { DataPermissionsHelp } from "metabase/permissions";
import { useNavigate, useParams } from "metabase/router";
import { Box, Button, Flex, Icon, Loader, Text, Tooltip } from "metabase/ui";

import {
  GroupPreviewInfo,
  useGroupMemberCount,
  useStandInGroupNames,
} from "../GroupPreviewInfo";
import {
  ExplainAccessButton,
  PreviewBand,
  getPrincipalWhoName,
  useIsNarrowPreview,
} from "../PreviewBand";
import {
  type PreviewSessionResponse,
  type Principal,
  type PrincipalType,
  type StartPreviewRequest,
  type StartPreviewResponse,
  sendEndPreviewBeacon,
  useEndPreviewMutation,
  useGetAffectingAttributesQuery,
  useStartPreviewMutation,
  useStartPreviewSessionMutation,
} from "../api";
import {
  CONTENT_PREVIEW_ALL_COLLECTIONS_PATH,
  getContentPreviewUrl,
} from "../content-preview";
import { getPreviewUrl } from "../preview-state";
import {
  type PreviewRouteParams,
  parsePrincipal,
  parsePrincipalType,
} from "../urls";

import { AttributeBar } from "./AttributeBar";
import { ContentPreviewFrame } from "./ContentPreviewFrame";
import { LinkBar } from "./LinkBar";
import { PreviewSidebar } from "./PreviewSidebar";
import { WhyListSidesheet } from "./WhyListSidesheet";
import { parseOpenedItem } from "./item-path";

const START_PATH = CONTENT_PREVIEW_ALL_COLLECTIONS_PATH;

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
  const [restartCount, setRestartCount] = useState(0);
  const standInGroupNames = useStandInGroupNames(principal);
  const groupMemberCount = useGroupMemberCount(principal);
  const isNarrow = useIsNarrowPreview();

  const [startPreview] = useStartPreviewMutation();
  const request = usePreviewRequest(principal, pickedValues);
  const { preview, error } = usePreviewSession(request, restartCount);

  const openedItem = parseOpenedItem(framePath);
  const { data: attributes = [], isFetching: isLoadingAttributes } =
    useGetAffectingAttributesQuery(
      principal != null ? { principal } : skipToken,
    );
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

  // the frame's item in a "View app as…" tab of its own, as the same person with the same values
  const handleOpenInNewTab = async () => {
    if (principal == null) {
      return;
    }
    // opened before the request, while the click still counts, so the popup blocker lets it through
    const newTab = window.open("about:blank", "_blank");
    const result = await startPreview({
      ...principal,
      attributes: pickedValues,
    });
    if (newTab == null || result.data == null) {
      newTab?.close();
      return;
    }
    newTab.opener = null;
    newTab.location.assign(
      getPreviewUrl(framePath, {
        userId: result.data.user_id,
        userName: result.data.user_name,
        principalType: principal.type,
        principalId: principal.id,
        principalName: result.data.principal_name,
        attributes: result.data.attributes,
        returnPath: `${window.location.pathname}${window.location.search}`,
        previewId: result.data.preview_id,
      }),
    );
  };

  const handleContentFrameRestart = () => {
    keepFramePath();
    setRestartCount((count) => count + 1);
  };

  const frameSrc = useMemo(
    () => (preview != null ? getContentPreviewUrl(openedPath) : null),
    // a new address only when the frame remounts
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [preview, openCount],
  );

  // a new key remounts the frame, which shows the loader until its first load
  const frameKey = `${preview?.preview_id}-${openCount}`;
  const [loadedFrameKey, setLoadedFrameKey] = useState<string | null>(null);

  const whoName = getWhoName(principalType, preview);
  const frameTitle = t`What ${whoName} sees`;

  return (
    <PermissionsPageLayout
      tab="troubleshoot"
      helpContent={<DataPermissionsHelp />}
    >
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
      </Flex>
      {principal == null ? (
        <PermissionsEditorEmptyState
          icon="eye"
          message={t`Select a user, group, or tenant to see the app the way they do`}
        />
      ) : (
        <Flex direction="column" flex={1} miw={0} p="md" gap="sm">
          <PreviewBand
            variant="troubleshoot"
            whoName={preview != null ? whoName : null}
            sentenceSection={
              principal.type !== "user" &&
              preview != null && (
                <GroupPreviewInfo
                  type={principal.type}
                  groupNames={standInGroupNames}
                  attributeValues="picked"
                  isCompact={isNarrow}
                />
              )
            }
          >
            {/* the item kept across a person switch may be one the new person can't open */}
            <Tooltip label={t`Back to all collections`}>
              <Button
                size="sm"
                style={{ flexShrink: 0 }}
                aria-label={t`Back to all collections`}
                leftSection={<Icon name="home" />}
                onClick={() => handleOpen(START_PATH)}
              />
            </Tooltip>
            <LinkBar framePath={framePath} onOpen={handleOpen} />
            <ExplainAccessButton
              isOpen={isWhyOpen}
              // the band wraps instead of hiding the words
              isCompact={false}
              disabled={preview == null}
              onClick={() => setIsWhyOpen((isOpen) => !isOpen)}
            />
            <Tooltip label={t`Open in new tab`}>
              <Button
                size="sm"
                style={{ flexShrink: 0 }}
                aria-label={t`Open in new tab`}
                leftSection={<Icon name="external" />}
                disabled={preview == null}
                onClick={handleOpenInNewTab}
              />
            </Tooltip>
          </PreviewBand>
          <AttributeBar
            key={`${principal.type}-${principal.id}`}
            principalType={principalType}
            whoName={whoName}
            attributes={attributes}
            isLoading={isLoadingAttributes}
            pickedValues={pickedValues}
            groupMemberCount={groupMemberCount}
            onPick={(attribute, value) => {
              keepFramePath();
              setPickedValues((values) => {
                const { [attribute]: _previous, ...others } = values;
                return value == null
                  ? others
                  : { ...others, [attribute]: value };
              });
            }}
          />
          {error != null && (
            <Text c="feedback-negative">{getErrorMessage(error)}</Text>
          )}
          <Box
            flex={1}
            mih={0}
            pos="relative"
            style={{
              border: "1px solid var(--mb-color-border-neutral-strong)",
              borderRadius: "var(--mantine-radius-md)",
              overflow: "hidden",
            }}
          >
            {(preview == null || loadedFrameKey !== frameKey) && (
              <Flex
                pos="absolute"
                inset={0}
                direction="column"
                align="center"
                justify="center"
                gap="md"
                bg="background_page-primary"
                style={{ zIndex: 1 }}
              >
                <Loader />
                <Text c="text-secondary">
                  {whoName !== "" ? t`Loading ${whoName}'s view…` : t`Loading…`}
                </Text>
              </Flex>
            )}
            {preview != null && (
              <ContentPreviewFrame
                key={frameKey}
                title={frameTitle}
                src={frameSrc ?? "about:blank"}
                frameOrigin={window.location.origin}
                sessionToken={preview.session_token}
                onPathChange={setFramePath}
                onRestart={handleContentFrameRestart}
                onLoad={() => setLoadedFrameKey(frameKey)}
              />
            )}
          </Box>
        </Flex>
      )}
      <WhyListSidesheet
        isOpen={isWhyOpen}
        preview={
          preview != null
            ? { userId: preview.user_id, previewId: preview.preview_id }
            : null
        }
        whoName={whoName}
        openedItem={openedItem}
        onClose={() => setIsWhyOpen(false)}
      />
    </PermissionsPageLayout>
  );
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
  return preview != null
    ? getPrincipalWhoName(
        principalType,
        preview.user_name,
        preview.principal_name,
      )
    : "";
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
            attributes: pickedValues,
          }
        : null,
    [type, id, pickedValues],
  );
}

/**
 * Starts the preview with a session token of the person's own, and ends it when the person or values change, the
 * frame restarts, or the page closes.
 */
function usePreviewSession(
  request: StartPreviewRequest | null,
  restartCount: number,
) {
  const [startPreviewSession] = useStartPreviewSessionMutation();
  const [endPreview] = useEndPreviewMutation();
  const [preview, setPreview] = useState<PreviewSessionResponse | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    setPreview(null);
    setError(null);
    if (request == null) {
      return;
    }
    let isCurrent = true;
    let started: PreviewSessionResponse | null = null;
    startPreviewSession(request)
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
    // a reload or a closed tab ends the preview now, not when its session expires
    const handlePageHide = () => {
      if (started != null) {
        sendEndPreviewBeacon(request, started);
        started = null;
      }
    };
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      isCurrent = false;
      window.removeEventListener("pagehide", handlePageHide);
      if (started != null) {
        endPreview({ request, preview: started });
      }
    };
  }, [request, restartCount, startPreviewSession, endPreview]);

  return { preview, error };
}
