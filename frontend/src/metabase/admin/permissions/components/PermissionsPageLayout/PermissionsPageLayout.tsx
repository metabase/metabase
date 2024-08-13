import cx from "classnames";
import type { ReactNode } from "react";
import { useCallback } from "react";
import type { Route } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";

import {
  FullHeightContainer,
  TabsContainer,
  PermissionPageRoot,
  PermissionPageContent,
  PermissionPageSidebar,
  CloseSidebarButton,
  ToolbarButtonsContainer,
} from "metabase/admin/permissions/components/PermissionsPageLayout/PermissionsPageLayout.styled";
import { getIsHelpReferenceOpen } from "metabase/admin/permissions/selectors/help-reference";
import { LeaveConfirmationModal } from "metabase/components/LeaveConfirmationModal";
import Modal from "metabase/components/Modal";
import ModalContent from "metabase/components/ModalContent";
import Button from "metabase/core/components/Button";
import CS from "metabase/css/core/index.css";
import fitViewport from "metabase/hoc/FitViewPort";
import { useToggle } from "metabase/hooks/use-toggle";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { updateUserSetting } from "metabase/redux/settings";
import type { IconName } from "metabase/ui";
import {
  Modal as NewModal,
  Text,
  Button as NewButton,
  Group,
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

type PermissionsPageTab = "data" | "collections";
type PermissionsPageLayoutProps = {
  children: ReactNode;
  tab: PermissionsPageTab;
  confirmBar?: ReactNode;
  diff?: PermissionsGraph;
  isDirty: boolean;
  onSave: () => void;
  onLoad: () => void;
  saveError?: string;
  clearSaveError: () => void;
  navigateToLocation: (location: string) => void;
  route: Route;
  navigateToTab: (tab: string) => void;
  helpContent?: ReactNode;
  toolbarRightContent?: ReactNode;
  showSplitPermsModal?: boolean;
};

const CloseSidebarButtonWithDefault = ({
  name = "close",
  ...props
}: {
  name?: IconName;
  [key: string]: unknown;
}) => <CloseSidebarButton aria-label={t`Close`} name={name} {...props} />;

function PermissionsPageLayout({
  children,
  tab,
  diff,
  isDirty,
  onSave,
  onLoad,
  route,
  toolbarRightContent,
  helpContent,
  showSplitPermsModal: _showSplitPermsModal = false,
}: PermissionsPageLayoutProps) {
  const [showSplitPermsModal, { turnOff: disableSplitPermsModal }] =
    useToggle(_showSplitPermsModal);

  const saveError = useSelector(state => state.admin.permissions.saveError);
  const showRefreshModal = useSelector(showRevisionChangedModal);

  const isHelpReferenceOpen = useSelector(getIsHelpReferenceOpen);
  const dispatch = useDispatch();

  const navigateToTab = (tab: PermissionsPageTab) =>
    dispatch(push(`/admin/permissions/${tab}`));
  const clearSaveError = () => dispatch(clearPermissionsSaveError());

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
            onCancel={() => onLoad()}
          />
        )}

        <Modal isOpen={saveError != null}>
          <ModalContent
            title={t`There was an error saving`}
            formModal
            onClose={clearSaveError}
          >
            <p className={CS.mb4}>{saveError}</p>
            <div className={cx(CS.mlAuto)}>
              <Button onClick={clearSaveError}>{t`OK`}</Button>
            </div>
          </ModalContent>
        </Modal>

        <LeaveConfirmationModal isEnabled={isDirty} route={route} />

        <TabsContainer className={CS.borderBottom}>
          <PermissionsTabs tab={tab} onChangeTab={navigateToTab} />
          <ToolbarButtonsContainer>
            {toolbarRightContent}
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
          To edit permissions, you need to start from the latest version. Please
          refresh the page.
        </Text>
        <Group position="right">
          <NewButton onClick={() => location.reload()} variant="filled">
            Refresh the page
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default fitViewport(PermissionsPageLayout);
