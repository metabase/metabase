import { useEffect, useState } from "react";
import { t } from "ttag";

import { skipToken } from "metabase/api";
import { useLocation } from "metabase/router";
import {
  Box,
  Button,
  Flex,
  Group,
  Icon,
  Text,
  useElementSize,
} from "metabase/ui";

import {
  GroupPreviewInfo,
  useGroupMemberCount,
  useStandInGroupNames,
} from "./GroupPreviewInfo";
import {
  ExplainAccessButton,
  PreviewBand,
  getPrincipalSentenceName,
  getPrincipalWhoName,
  isNarrowPreview,
  useIsNarrowPreview,
} from "./PreviewBand";
import { PrincipalList } from "./PrincipalList";
import {
  UnsavedEditsBandSection,
  UnsavedEditsSheet,
} from "./UnsavedEditsBanner";
import {
  type Principal,
  sendEndPreviewBeacon,
  useGetAffectingAttributesQuery,
  useGetDataPreviewQuery,
  useGetUnsavedEditsQuery,
  useStartPreviewMutation,
} from "./api";
import {
  type PreviewState,
  clearPreviewState,
  getPreviewUrl,
} from "./preview-state";
import { AttributeBar, getRuleAttributes } from "./troubleshoot/AttributeBar";
import { WhyListSidesheet } from "./troubleshoot/WhyListSidesheet";
import { parseOpenedItem } from "./troubleshoot/item-path";

const PANEL_WIDTH = "16rem";
const PANEL_STORAGE_KEY = "metabase.permissionPreview.panel";
// above the app's own sidebars, below its modals and popovers
const FRAME_Z_INDEX = 150;
// read by `sidesheet.module.css`
const SIDESHEET_TOP_PROPERTY = "--mb-sidesheet-top";

/**
 * The banner of a tab that previews the app as another person: a button that opens and closes the panel holding the
 * Troubleshoot page's controls (the attribute bar, and the list where picking a user, group or tenant reloads the same
 * address as them), "Explain access", and the way back to the admin's own view.
 */
export function PreviewBanner({ state }: { state: PreviewState }) {
  const location = useLocation();
  const isNarrow = useIsNarrowPreview();
  const [isPanelOpen, setIsPanelOpen] = useState(readIsPanelOpen);
  const { ref: frameRef, height: frameHeight } = useElementSize();
  const [isSwitching, setIsSwitching] = useState(false);
  const [startPreview] = useStartPreviewMutation();
  const principal: Principal = {
    type: state.principalType,
    id: state.principalId,
  };
  const whoName = getPrincipalWhoName(
    state.principalType,
    state.userName,
    state.principalName,
  );

  const openedItem = parseOpenedItem(location.pathname);
  const { data: attributes = [], isFetching: isLoadingAttributes } =
    useGetAffectingAttributesQuery({ principal });
  const [isWhyOpen, setIsWhyOpen] = useState(false);
  const standInGroupNames = useStandInGroupNames(principal);
  const groupMemberCount = useGroupMemberCount(principal);

  useEndPreviewOnPageHide(state);
  useFrameAroundApp({
    frameHeight,
    panelWidth: isPanelOpen && !isNarrow ? PANEL_WIDTH : "0px",
  });

  const handlePanelToggle = (isOpen: boolean) => {
    window.sessionStorage.setItem(
      PANEL_STORAGE_KEY,
      isOpen ? "open" : "closed",
    );
    setIsPanelOpen(isOpen);
  };

  // a full load at the same address, so nothing fetched as the previous person stays cached
  const switchTo = async (
    newPrincipal: Principal,
    newAttributes: Record<string, string>,
    unsavedEdits = state.unsavedEdits,
  ) => {
    setIsSwitching(true);
    const result = await startPreview({
      ...newPrincipal,
      attributes: newAttributes,
      unsavedEditsId: unsavedEdits?.isApplied ? unsavedEdits.id : undefined,
    });
    if (result.data == null) {
      setIsSwitching(false);
      return;
    }
    window.location.assign(
      getPreviewUrl(
        `${window.location.pathname}${window.location.search}${window.location.hash}`,
        {
          userId: result.data.user_id,
          userName: result.data.user_name,
          principalType: newPrincipal.type,
          principalId: newPrincipal.id,
          principalName: result.data.principal_name,
          attributes: result.data.attributes,
          returnPath: state.returnPath,
          previewId: result.data.preview_id,
          unsavedEdits,
        },
      ),
    );
  };

  const handlePick = (attribute: string, value: string | null) => {
    const { [attribute]: _previous, ...others } = state.attributes;
    switchTo(
      principal,
      value == null ? others : { ...others, [attribute]: value },
    );
  };

  const handleExit = () => {
    clearPreviewState();
    if (state.unsavedEdits != null) {
      // back to the permissions page's own tab, which still holds the edits; a tab the browser won't close falls through
      window.close();
    }
    // a full load, so nothing fetched as the previewed person stays cached
    window.location.assign(state.returnPath);
  };

  return (
    <>
      <Box
        ref={frameRef}
        pos="fixed"
        top={0}
        left={0}
        right={0}
        style={{ zIndex: FRAME_Z_INDEX }}
      >
        <PreviewBand
          variant="full-screen"
          whoName={whoName}
          previewedUserId={
            state.principalType === "user" ? state.principalId : undefined
          }
          sentenceSection={
            <>
              {state.principalType !== "user" && (
                <GroupPreviewInfo
                  type={state.principalType}
                  groupNames={standInGroupNames}
                  attributeValues="picked"
                  isCompact={isNarrow}
                />
              )}
              {state.unsavedEdits != null && (
                <FullScreenEditsSection
                  unsavedEdits={state.unsavedEdits}
                  principal={principal}
                  whoName={whoName}
                  isSwitching={isSwitching}
                  onUnsavedEditsChange={(unsavedEdits) =>
                    switchTo(principal, state.attributes, unsavedEdits)
                  }
                />
              )}
            </>
          }
          leftSection={
            <Button
              size="sm"
              variant={isPanelOpen ? "light" : "default"}
              style={{ flexShrink: 0 }}
              loading={isSwitching}
              leftSection={<Icon name="sidebar_open" />}
              aria-pressed={isPanelOpen}
              onClick={() => handlePanelToggle(!isPanelOpen)}
            >
              {t`Preview settings`}
            </Button>
          }
        >
          <ExplainAccessButton
            isOpen={isWhyOpen}
            isCompact={isNarrow}
            onClick={() => setIsWhyOpen((isOpen) => !isOpen)}
          />
          <Button
            size="sm"
            variant="filled"
            style={{ flexShrink: 0 }}
            loading={isSwitching}
            aria-label={isNarrow ? t`Exit preview` : undefined}
            onClick={handleExit}
          >
            {isNarrow ? t`Exit` : t`Exit preview`}
          </Button>
        </PreviewBand>
      </Box>
      {/* after the frame, so Tab reaches the band before the panel, as they read on screen */}
      {isPanelOpen && (
        <Flex
          direction="column"
          pos="fixed"
          top={frameHeight}
          bottom={0}
          left={0}
          w={PANEL_WIDTH}
          bg="background_page-primary"
          style={{
            zIndex: FRAME_Z_INDEX,
            borderRight: "1px solid var(--mb-color-border-neutral)",
            // on a narrow screen it opens over the app instead of pushing it aside
            boxShadow: isNarrow ? "var(--mantine-shadow-md)" : undefined,
          }}
          aria-label={t`Preview settings`}
          role="navigation"
        >
          <Group justify="space-between" px="sm" pt="sm">
            <Text fw="bold">{t`Preview settings`}</Text>
            <Button
              size="compact-sm"
              variant="subtle"
              aria-label={t`Collapse the preview settings`}
              leftSection={<Icon name="chevronleft" />}
              onClick={() => handlePanelToggle(false)}
            />
          </Group>
          {(isLoadingAttributes ||
            getRuleAttributes(attributes).length > 0) && (
            <Box
              p="sm"
              style={{
                borderBottom: "1px solid var(--mb-color-border-neutral)",
              }}
            >
              <AttributeBar
                isLabelOnOwnRow
                principalType={state.principalType}
                whoName={whoName}
                attributes={attributes}
                isLoading={isLoadingAttributes}
                pickedValues={state.attributes}
                groupMemberCount={groupMemberCount}
                onPick={handlePick}
              />
            </Box>
          )}
          <Text fw="bold" px="sm" pt="sm" pb="xs">{t`View as`}</Text>
          <PrincipalList
            principal={principal}
            onPrincipalChange={(newPrincipal) => switchTo(newPrincipal, {})}
          />
        </Flex>
      )}
      <WhyListSidesheet
        isOpen={isWhyOpen}
        preview={{
          principalType: state.principalType,
          userId: state.userId,
          previewId: state.previewId,
          unsavedEditsId: state.unsavedEdits?.isApplied
            ? state.unsavedEdits.id
            : undefined,
        }}
        whoName={whoName}
        sentenceWhoName={getPrincipalSentenceName(
          state.principalType,
          state.userName,
          state.principalName,
        )}
        openedItem={openedItem}
        onClose={() => setIsWhyOpen(false)}
      />
    </>
  );
}

type FullScreenEditsSectionProps = {
  unsavedEdits: NonNullable<PreviewState["unsavedEdits"]>;
  principal: Principal;
  whoName: string;
  isSwitching: boolean;
  onUnsavedEditsChange: (
    unsavedEdits: NonNullable<PreviewState["unsavedEdits"]>,
  ) => void;
};

/**
 * The band's unsaved-edits section: "See changes" lists the edits read-only, since this tab can't edit, under a switch
 * that restarts the preview with or without them.
 */
function FullScreenEditsSection({
  unsavedEdits,
  principal,
  whoName,
  isSwitching,
  onUnsavedEditsChange,
}: FullScreenEditsSectionProps) {
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const { data: editsResponse } = useGetUnsavedEditsQuery(unsavedEdits.id);
  // the admin's own call (`/api/ee/permission_debug/`), for the person's groups
  const { data: dataPreview } = useGetDataPreviewQuery(
    isSheetOpen ? principal : skipToken,
  );
  const edits = editsResponse?.edits ?? [];

  return (
    <>
      <UnsavedEditsBandSection
        count={edits.length}
        isWithEdits={unsavedEdits.isApplied}
        isSheetOpen={isSheetOpen}
        onSheetToggle={() => setIsSheetOpen((isOpen) => !isOpen)}
      />
      <UnsavedEditsSheet
        isOpen={isSheetOpen}
        edits={edits}
        isWithEdits={unsavedEdits.isApplied}
        isSwitchDisabled={isSwitching}
        onIsWithEditsChange={(isApplied) =>
          onUnsavedEditsChange({ id: unsavedEdits.id, isApplied })
        }
        whoName={whoName}
        principalGroupIds={
          dataPreview?.principal.groups.map((group) => group.id) ?? null
        }
        onClose={() => setIsSheetOpen(false)}
      />
    </>
  );
}

/**
 * Leaving the page (a reload, a closed tab, a switch of person, the exit) ends this load's preview, so the audit gets
 * its end now; a reload starts it again (`restartStoredPreview`).
 */
function useEndPreviewOnPageHide(state: PreviewState) {
  useEffect(() => {
    const handlePageHide = () => {
      // read when the page goes: a reload's restart replaces the id after the first render
      if (state.previewId != null) {
        sendEndPreviewBeacon(
          { type: state.principalType, id: state.principalId },
          {
            preview_id: state.previewId,
            user_id: state.userId,
            user_name: state.userName,
            principal_name: state.principalName,
            attributes: state.attributes,
          },
        );
      }
    };
    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, [state]);
}

/**
 * The band spans the top of the tab, and the app sits below it, right of the open panel. Side sheets start below it
 * too, so the band's controls stay reachable while a sheet is open.
 */
function useFrameAroundApp({
  frameHeight,
  panelWidth,
}: {
  frameHeight: number;
  panelWidth: string;
}) {
  useEffect(() => {
    // the app shell fills its containing block (`CS.spread`), so the root becomes that block, inside the frame
    const root = document.getElementById("root");
    if (root == null) {
      return;
    }
    Object.assign(root.style, {
      position: "fixed",
      inset: `${frameHeight}px 0 0 ${panelWidth}`,
    });
    document.documentElement.style.setProperty(
      SIDESHEET_TOP_PROPERTY,
      `${frameHeight}px`,
    );
    return () => {
      Object.assign(root.style, { position: "", inset: "" });
      document.documentElement.style.removeProperty(SIDESHEET_TOP_PROPERTY);
    };
  }, [frameHeight, panelWidth]);
}

/** Open unless closed earlier in this tab; on a narrow screen it starts closed, since it would cover the app. */
function readIsPanelOpen() {
  const stored = window.sessionStorage.getItem(PANEL_STORAGE_KEY);
  return stored != null ? stored === "open" : !isNarrowPreview();
}
