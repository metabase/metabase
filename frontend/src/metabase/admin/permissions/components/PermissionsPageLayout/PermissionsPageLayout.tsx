import type { ReactNode } from "react";
import { useCallback, useState } from "react";
import { t } from "ttag";

import {
  CloseSidebarButton,
  FullHeightContainer,
  PermissionPageContent,
  PermissionPageRoot,
  PermissionPageSidebar,
  TabsContainer,
  ToolbarButtonsContainer,
} from "metabase/admin/permissions/components/PermissionsPageLayout/PermissionsPageLayout.styled";
import { getIsHelpReferenceOpen } from "metabase/admin/permissions/selectors/help-reference";
import type { PermissionsGraphDiff } from "metabase/admin/permissions/types";
import { isEmbeddingHubPermissions } from "metabase/admin/permissions/utils/is-embedding-hub";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { getPermissionsBasePath } from "metabase/common/components/PermissionsBasePath/base-path";
import { useDispatch, useSelector } from "metabase/redux";
import { useNavigate } from "metabase/router";
import { useUserSetting } from "metabase/settings";
import {
  Group,
  Button as NewButton,
  Modal as NewModal,
  Text,
} from "metabase/ui";
import type { IconName } from "metabase-types/api";

import {
  clearSaveError as clearPermissionsSaveError,
  toggleHelpReference,
} from "../../permissions";
import { showRevisionChangedModal } from "../../selectors/data-permissions/revision";
import { LegacyPermissionsModal } from "../LegacyPermissionsModal/LegacyPermissionsModal";
import { ToolbarButton } from "../ToolbarButton";

import { PermissionsEditBar } from "./PermissionsEditBar";
import S from "./PermissionsPageLayout.module.css";
import { PermissionsTabs } from "./PermissionsTabs";

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

const CloseSidebarButtonWithDefault = ({
  name = "close",
  ...props
}: {
  name?: IconName;
  [key: string]: unknown;
}) => <CloseSidebarButton aria-label={t`Close`} name={name} {...props} />;

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

  return (
    <PermissionPageRoot>
      <PermissionPageContent>
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
          confirmButtonProps={{ variant: "outline" }}
          closeButtonText={null}
        />

        <TabsContainer>
          <PermissionsTabs tab={tab} onChangeTab={navigateToTab} />
          <ToolbarButtonsContainer
            className={
              isEmbeddingHubPermissions() ? S.hubToolbarButtons : undefined
            }
          >
            {helpContent && !isHelpReferenceOpen && (
              <ToolbarButton
                text={t`Permissions help`}
                icon="info"
                onClick={handleToggleHelpReference}
              />
            )}
          </ToolbarButtonsContainer>
        </TabsContainer>

        <FullHeightContainer>{children}</FullHeightContainer>
      </PermissionPageContent>

      {isHelpReferenceOpen && (
        <PermissionPageSidebar aria-label={t`Permissions help reference`}>
          <CloseSidebarButtonWithDefault onClick={handleToggleHelpReference} />
          {helpContent}
        </PermissionPageSidebar>
      )}
      <NewModal
        title="Someone just changed permissions"
        opened={showRefreshModal}
        size="lg"
        padding="2.5rem"
        withCloseButton={false}
        onClose={() => true}
      >
        <Text mb="1rem">
          {t`To edit permissions, you need to start from the latest version. Please refresh the page.`}
        </Text>
        <Group justify="flex-end">
          <NewButton onClick={() => location.reload()} variant="filled">
            {t`Refresh the page`}
          </NewButton>
        </Group>
      </NewModal>
      <LegacyPermissionsModal
        isOpen={showSplitPermsModal}
        onClose={handleDimissSplitPermsModal}
      />
    </PermissionPageRoot>
  );
}
