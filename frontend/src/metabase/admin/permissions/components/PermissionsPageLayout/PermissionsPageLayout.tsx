import cx from "classnames";
import type { ReactNode } from "react";
import { useCallback, useState } from "react";
import { c, t } from "ttag";

import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { getPermissionsBasePath } from "metabase/common/components/PermissionsBasePath/base-path";
import CS from "metabase/css/core/index.css";
import { CONTENT_PADDING_X } from "metabase/nav/components/AreaLayout";
import {
  LegacyPermissionsModal,
  type PermissionsGraphDiff,
  ToolbarButton,
  clearSaveError as clearPermissionsSaveError,
  getIsHelpReferenceOpen,
  isEmbeddingHubPermissions,
  showRevisionChangedModal,
  toggleHelpReference,
} from "metabase/permissions";
import { useDispatch, useSelector } from "metabase/redux";
import { useNavigate } from "metabase/router";
import { useUserSetting } from "metabase/settings";
import {
  Box,
  Flex,
  Icon,
  Button as NewButton,
  Modal as NewModal,
  Text,
  Title,
} from "metabase/ui";

import { PermissionsEditBar } from "./PermissionsEditBar";
import S from "./PermissionsPageLayout.module.css";
import { PermissionsTabs, usePermissionsTabs } from "./PermissionsTabs";

export type PermissionsPageTab =
  | "data"
  | "collections"
  | "application"
  | "tenant-collections"
  | "tenant-specific-collections";
type PermissionsPageLayoutProps = {
  children: ReactNode;
  tab: PermissionsPageTab;
  confirmBar?: ReactNode;
  diff?: PermissionsGraphDiff;
  isDirty?: boolean;
  onSave?: () => void;
  onLoad?: () => void;
  saveError?: string;
  clearSaveError?: () => void;
  navigateToLocation?: (location: string) => void;
  navigateToTab?: (tab: string) => void;
  helpContent?: ReactNode;
  canShowSplitPermsModal?: boolean;
};

export function PermissionsPageLayout({
  children,
  tab,
  diff,
  isDirty,
  onSave,
  onLoad,
  helpContent,
  canShowSplitPermsModal = false,
}: PermissionsPageLayoutProps) {
  const [showModalSetting, setShowModalSetting] = useUserSetting(
    "show-updated-permission-modal",
    { shouldDebounce: false },
  );
  // Stops the split permissions modal from reopening after the user dismisses it once,
  // even if the save fails
  const [isSplitPermsModalDismissed, setIsSplitPermsModalDismissed] =
    useState(false);
  const showSplitPermsModal =
    canShowSplitPermsModal && !!showModalSetting && !isSplitPermsModalDismissed;

  const saveError = useSelector((state) => state.admin.permissions.saveError);
  const showRefreshModal = useSelector(showRevisionChangedModal);

  const isHelpReferenceOpen = useSelector(getIsHelpReferenceOpen);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const tabName = usePermissionsTabs().find(
    (option) => option.value === tab,
  )?.name;

  const navigateToTab = (tab: PermissionsPageTab) =>
    navigate(`${getPermissionsBasePath()}/${tab}`);

  const clearSaveError = () => {
    dispatch(clearPermissionsSaveError());
  };

  const handleToggleHelpReference = useCallback(() => {
    dispatch(toggleHelpReference());
  }, [dispatch]);

  const handleDimissSplitPermsModal = () => {
    setIsSplitPermsModalDismissed(true);
    setShowModalSetting(false);
  };

  const isHub = isEmbeddingHubPermissions();
  // In admin, "By group" and "By database" are picked from the side nav, so the
  // data access pages skip the header bar and float the help button instead.
  const showHeaderBar = isHub || tab !== "data";
  const helpButton = helpContent && !isHelpReferenceOpen && (
    <ToolbarButton
      text={t`Permissions help`}
      icon="info"
      onClick={handleToggleHelpReference}
    />
  );

  return (
    <Flex className={CS.overflowHidden} h="100%">
      <Flex className={CS.overflowHidden} direction="column" flex={1}>
        {isDirty && (
          <PermissionsEditBar
            diff={diff}
            isDirty={isDirty}
            onSave={onSave}
            onCancel={() => onLoad?.()}
          />
        )}

        <LeaveRouteConfirmModal isEnabled={Boolean(isDirty)} />

        <ConfirmModal
          opened={saveError != null}
          onClose={clearSaveError}
          onConfirm={clearSaveError}
          title={t`There was an error saving`}
          message={saveError}
          confirmButtonText={t`OK`}
          confirmButtonProps={{ variant: "default", color: "neutral" }}
          closeButtonText={null}
        />

        {showHeaderBar && (
          <Flex
            className={CS.borderBottom}
            justify="space-between"
            align="center"
            mih={isHub ? undefined : "3.5rem"}
          >
            {isHub ? (
              <PermissionsTabs tab={tab} onChangeTab={navigateToTab} />
            ) : (
              // The admin side nav picks the section, so only name it here.
              <Title order={3} pl="xxl">
                {tabName}
              </Title>
            )}
            <Flex
              pl="lg"
              pr={isHub ? `calc(${CONTENT_PADDING_X} - 0.75rem)` : "lg"}
            >
              {helpButton}
            </Flex>
          </Flex>
        )}

        <Flex className={CS.overflowHidden} h="100%" pos="relative">
          {children}
          {!showHeaderBar && helpButton && (
            // `top`/`right` don't resolve spacing tokens, so pass the variables.
            <Box
              pos="absolute"
              top="var(--mantine-spacing-md)"
              right="var(--mantine-spacing-lg)"
            >
              {helpButton}
            </Box>
          )}
        </Flex>
      </Flex>

      {isHelpReferenceOpen && (
        <Flex
          component="aside"
          className={cx(CS.borderLeft, CS.overflowAuto)}
          direction="column"
          pos="relative"
          maw="20rem"
          aria-label={t`Permissions help reference`}
        >
          <Icon
            className={cx(S.closeButton, CS.cursorPointer)}
            name="close"
            pos="absolute"
            top="1.75rem"
            right="1.5rem"
            aria-label={c("A verb, not a noun").t`Close`}
            onClick={handleToggleHelpReference}
          />
          {helpContent}
        </Flex>
      )}
      <NewModal
        title="Someone just changed permissions"
        opened={showRefreshModal}
        size="lg"
        withCloseButton={false}
        onClose={() => true}
      >
        <Text>
          {t`To edit permissions, you need to start from the latest version. Please refresh the page.`}
        </Text>
        <NewModal.Footer>
          <NewButton onClick={() => location.reload()} variant="filled">
            {t`Refresh the page`}
          </NewButton>
        </NewModal.Footer>
      </NewModal>
      <LegacyPermissionsModal
        isOpen={showSplitPermsModal}
        onClose={handleDimissSplitPermsModal}
      />
    </Flex>
  );
}
