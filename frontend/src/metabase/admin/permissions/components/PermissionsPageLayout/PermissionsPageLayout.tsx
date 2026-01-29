import type { ReactNode } from "react";
import { useCallback } from "react";
import type { Route } from "react-router";
import { push } from "react-router-redux";
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
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { useToggle } from "metabase/common/hooks/use-toggle";
import CS from "metabase/css/core/index.css";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { updateUserSetting } from "metabase/redux/settings";
import type { IconName } from "metabase/ui";
import {
  Group,
  Button as NewButton,
  Modal as NewModal,
  Text,
} from "metabase/ui";
import type { PermissionsGraph } from "metabase-types/api";

import {
  clearSaveError as clearPermissionsSaveError,
  toggleHelpReference,
} from "../../permissions";
import { showRevisionChangedModal } from "../../selectors/data-permissions/revision";
import { LegacyPermissionsModal } from "../LegacyPermissionsModal/LegacyPermissionsModal";
import { ToolbarButton } from "../ToolbarButton";

import { PermissionsEditBar } from "./PermissionsEditBar";
import { PermissionsTabs } from "./PermissionsTabs";

type PermissionsPageTab =
  | "data"
  | "collections"
  | "application"
  | "tenant-collections"
  | "tenant-specific-collections";
type PermissionsPageLayoutProps = {
  children: ReactNode;
  tab: PermissionsPageTab;
  confirmBar?: ReactNode;
  diff?: PermissionsGraph;
  isDirty?: boolean;
  onSave?: () => void;
  onLoad?: () => void;
  saveError?: string;
  clearSaveError?: () => void;
  navigateToLocation?: (location: string) => void;
  route: Route;
  navigateToTab?: (tab: string) => void;
  helpContent?: ReactNode;
  showSplitPermsModal?: boolean;
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
  route,
  helpContent,
  showSplitPermsModal: _showSplitPermsModal = false,
}: PermissionsPageLayoutProps) {
  const [showSplitPermsModal, { turnOff: disableSplitPermsModal }] =
    useToggle(_showSplitPermsModal);

  const saveError = useSelector((state) => state.admin.permissions.saveError);
  const showRefreshModal = useSelector(showRevisionChangedModal);

  const isHelpReferenceOpen = useSelector(getIsHelpReferenceOpen);
  const dispatch = useDispatch();

  const navigateToTab = (tab: PermissionsPageTab) =>
    dispatch(push(`/admin/permissions/${tab}`));

  const clearSaveError = () => {
    dispatch(clearPermissionsSaveError());
  };

  const handleToggleHelpReference = useCallback(() => {
    dispatch(toggleHelpReference());
  }, [dispatch]);

  const handleDimissSplitPermsModal = () => {
    disableSplitPermsModal();
    dispatch(
      updateUserSetting({ key: "show-updated-permission-modal", value: false }),
    );
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

        <LeaveRouteConfirmModal isEnabled={Boolean(isDirty)} route={route} />

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

        <TabsContainer className={CS.borderBottom}>
          <PermissionsTabs tab={tab} onChangeTab={navigateToTab} />
          <ToolbarButtonsContainer>
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
