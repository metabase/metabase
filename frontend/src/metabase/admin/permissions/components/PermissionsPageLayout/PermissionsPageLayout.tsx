import type { ReactNode } from "react";
import { useCallback } from "react";
import { t } from "ttag";
import { push } from "react-router-redux";
import type { Route } from "react-router";

import Button from "metabase/core/components/Button";
import fitViewport from "metabase/hoc/FitViewPort";
import { LeaveConfirmationModal } from "metabase/components/LeaveConfirmationModal";
import Modal from "metabase/components/Modal";
import ModalContent from "metabase/components/ModalContent";

import {
  Modal as NewModal,
  Text,
  Button as NewButton,
  Group,
} from "metabase/ui";

import type { PermissionsGraph } from "metabase-types/api";
import { useDispatch, useSelector } from "metabase/lib/redux";
import {
  FullHeightContainer,
  TabsContainer,
  PermissionPageRoot,
  PermissionPageContent,
  PermissionPageSidebar,
  CloseSidebarButton,
  ToolbarButtonsContainer,
} from "metabase/admin/permissions/components/PermissionsPageLayout/PermissionsPageLayout.styled";
import type { IconName } from "metabase/ui";
import { getIsHelpReferenceOpen } from "metabase/admin/permissions/selectors/help-reference";
import {
  clearSaveError as clearPermissionsSaveError,
  toggleHelpReference,
} from "../../permissions";
import { ToolbarButton } from "../ToolbarButton";
import { showRevisionChangedModal } from "../../selectors/data-permissions/revision";
import { PermissionsTabs } from "./PermissionsTabs";

import { PermissionsEditBar } from "./PermissionsEditBar";

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
}: PermissionsPageLayoutProps) {
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
            <p className="mb4">{saveError}</p>
            <div className="ml-auto">
              <Button onClick={clearSaveError}>{t`OK`}</Button>
            </div>
          </ModalContent>
        </Modal>

        <LeaveConfirmationModal isEnabled={isDirty} route={route} />

        <TabsContainer className="border-bottom">
          <PermissionsTabs tab={tab} onChangeTab={navigateToTab} />
          <ToolbarButtonsContainer>
            {toolbarRightContent}
            {helpContent && !isHelpReferenceOpen && (
              <ToolbarButton
                text={t`Permission help`}
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
    </PermissionPageRoot>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default fitViewport(PermissionsPageLayout);
