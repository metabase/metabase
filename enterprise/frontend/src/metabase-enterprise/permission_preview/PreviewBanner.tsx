import { useState } from "react";
import { t } from "ttag";

import { skipToken } from "metabase/api";
import { useLocation } from "metabase/router";
import { Box, Button, Group, Icon, Menu, Stack, Text } from "metabase/ui";

import {
  type Principal,
  type PrincipalType,
  useGetAffectingAttributesQuery,
  useListPreviewPrincipalsQuery,
  useStartPreviewMutation,
} from "./api";
import {
  type PreviewState,
  clearPreviewState,
  getPreviewUrl,
} from "./preview-state";
import { PreviewSidebar } from "./preview/PreviewSidebar";
import { WhySidesheet, type WhyTarget } from "./preview/WhySidesheet";
import { usePreviewPrincipalSections } from "./principal-sections";
import { AccessSummarySidesheet } from "./troubleshoot/AccessSummarySidesheet";
import { AttributeBar } from "./troubleshoot/AttributeBar";
import { parseOpenedItem } from "./troubleshoot/item-path";
import { useAccessSummary, useWhyTarget } from "./troubleshoot/use-why-target";

const PANEL_WIDTH = "18.75rem";
const PANEL_STORAGE_KEY = "metabase.permissionPreview.panel";

/**
 * The banner of a tab that previews the app as another person, with the Troubleshoot page's controls: a collapsible
 * "View as" panel (or a "Switch person" menu) that reloads the same address as someone else, the attribute bar, "Why?",
 * and the way back to the admin's own view.
 */
export function PreviewBanner({ state }: { state: PreviewState }) {
  const location = useLocation();
  const [isPanelOpen, setIsPanelOpen] = useState(readIsPanelOpen);
  const [panelType, setPanelType] = useState<PrincipalType>(
    state.principalType,
  );
  const [isSwitching, setIsSwitching] = useState(false);
  const [startPreview] = useStartPreviewMutation();
  const principal: Principal = {
    type: state.principalType,
    id: state.principalId,
  };
  const whoName = getWhoName(state);

  const openedItem = parseOpenedItem(location.pathname);
  const { data: attributes = [], isFetching: isLoadingAttributes } =
    useGetAffectingAttributesQuery({
      principal,
      cardId: openedItem?.type === "card" ? openedItem.id : undefined,
      dashboardId: openedItem?.type === "dashboard" ? openedItem.id : undefined,
    });
  const whyTarget = useWhyTarget(principal, openedItem, attributes);
  const [whyOpen, setWhyOpen] = useState<"item" | "summary" | null>(null);
  const [summaryWhyTarget, setSummaryWhyTarget] = useState<WhyTarget | null>(
    null,
  );
  const accessSummary = useAccessSummary(
    whyOpen === "summary" ? principal : null,
  );

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
  ) => {
    setIsSwitching(true);
    const result = await startPreview({
      ...newPrincipal,
      attributes: newAttributes,
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
    // a full load, so nothing fetched as the previewed person stays cached
    window.location.assign(state.returnPath);
  };

  const handleWhyClose = () => {
    setWhyOpen(null);
    setSummaryWhyTarget(null);
  };

  return (
    <>
      {isPanelOpen && (
        <Stack
          gap={0}
          pos="fixed"
          top={0}
          bottom={0}
          left={0}
          w={PANEL_WIDTH}
          bg="background_page-primary"
          style={{
            // above the app's own sidebars, below its modals and popovers
            zIndex: 150,
            borderRight: "1px solid var(--mb-color-border-neutral)",
          }}
          aria-label={t`View as`}
          role="navigation"
        >
          <Group justify="space-between" px="md" pt="md">
            <Text fw="bold">{t`View as`}</Text>
            <Button
              size="compact-sm"
              variant="subtle"
              aria-label={t`Collapse the View as panel`}
              leftSection={<Icon name="chevronleft" />}
              onClick={() => handlePanelToggle(false)}
            />
          </Group>
          <Box flex={1} mih={0} style={{ display: "flex" }}>
            <PreviewSidebar
              principalType={panelType}
              principal={principal}
              useSections={usePreviewPrincipalSections}
              onPrincipalTypeChange={setPanelType}
              onPrincipalChange={(newPrincipal) => switchTo(newPrincipal, {})}
            />
          </Box>
        </Stack>
      )}
      <Stack
        gap={0}
        ml={isPanelOpen ? PANEL_WIDTH : 0}
        style={{ borderBottom: "1px solid var(--mb-color-border-neutral)" }}
      >
        <Group
          role="status"
          aria-label={t`Previewing as another user`}
          justify="center"
          gap="md"
          px="md"
          py="xs"
          bg="feedback-warning"
        >
          {!isPanelOpen && (
            <>
              <Button
                size="compact-sm"
                leftSection={<Icon name="sidebar_open" />}
                onClick={() => handlePanelToggle(true)}
              >
                {t`View as`}
              </Button>
              <SwitchPersonMenu
                isSwitching={isSwitching}
                onSwitch={(newPrincipal) => switchTo(newPrincipal, {})}
              />
            </>
          )}
          <Text fw="bold" c="text-primary">
            {getWhoText(state)}
          </Text>
          <Button
            size="compact-sm"
            disabled={openedItem != null && whyTarget == null}
            onClick={() => setWhyOpen(openedItem != null ? "item" : "summary")}
          >
            {t`Why?`}
          </Button>
          <Button size="compact-sm" loading={isSwitching} onClick={handleExit}>
            {t`Exit preview`}
          </Button>
        </Group>
        <Box px="md" py="xs" bg="background_page-primary">
          <AttributeBar
            principalType={state.principalType}
            whoName={whoName}
            attributes={attributes}
            isLoading={isLoadingAttributes}
            pickedValues={state.attributes}
            canQueryFields={false}
            onPick={handlePick}
          />
        </Box>
      </Stack>
      <AccessSummarySidesheet
        isOpen={whyOpen === "summary" && summaryWhyTarget == null}
        whoName={whoName}
        summary={accessSummary}
        onWhy={setSummaryWhyTarget}
        onClose={handleWhyClose}
      />
      <WhySidesheet
        target={summaryWhyTarget ?? (whyOpen === "item" ? whyTarget : null)}
        onClose={handleWhyClose}
      />
    </>
  );
}

/** The collapsed panel's stand-in: everyone who can be previewed, by kind. */
function SwitchPersonMenu({
  isSwitching,
  onSwitch,
}: {
  isSwitching: boolean;
  onSwitch: (principal: Principal) => void;
}) {
  const [isOpened, setIsOpened] = useState(false);
  const { data } = useListPreviewPrincipalsQuery(
    isOpened ? undefined : skipToken,
  );
  const kinds: { type: PrincipalType; label: string }[] = [
    { type: "user", label: t`Users` },
    { type: "group", label: t`Groups` },
    { type: "tenant", label: t`Tenants` },
  ];

  return (
    <Menu opened={isOpened} onChange={setIsOpened} position="bottom-start">
      <Menu.Target>
        <Button
          size="compact-sm"
          loading={isSwitching}
          rightSection={<Icon name="chevrondown" />}
        >
          {t`Switch person`}
        </Button>
      </Menu.Target>
      <Menu.Dropdown mah="24rem" style={{ overflowY: "auto" }}>
        {kinds.map(({ type, label }) =>
          (data?.[`${type}s`] ?? []).length > 0 ? (
            <Box key={type}>
              <Menu.Label>{label}</Menu.Label>
              {(data?.[`${type}s`] ?? []).map((item) => (
                <Menu.Item
                  key={item.id}
                  rightSection={
                    <Text fz="xs" c="text-secondary">
                      {item.detail}
                    </Text>
                  }
                  onClick={() => onSwitch({ type, id: item.id })}
                >
                  {item.name}
                </Menu.Item>
              ))}
            </Box>
          ) : null,
        )}
      </Menu.Dropdown>
    </Menu>
  );
}

function readIsPanelOpen() {
  return window.sessionStorage.getItem(PANEL_STORAGE_KEY) !== "closed";
}

function getWhoName(state: PreviewState) {
  switch (state.principalType) {
    case "group":
      return t`a member of ${state.principalName}`;
    case "tenant":
      return t`a user of ${state.principalName}`;
    default:
      return state.userName;
  }
}

function getWhoText(state: PreviewState) {
  switch (state.principalType) {
    case "group":
      return t`You're viewing the app as the group ${state.principalName}. Read-only: changes aren't allowed.`;
    case "tenant":
      return t`You're viewing the app as the tenant ${state.principalName}. Read-only: changes aren't allowed.`;
    default:
      return t`You're viewing the app as ${state.userName}. Read-only: changes aren't allowed.`;
  }
}
