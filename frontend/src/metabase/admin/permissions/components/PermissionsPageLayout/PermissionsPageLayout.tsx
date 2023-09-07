import type { ReactNode } from "react";
import { useCallback } from "react";
import _ from "underscore";
import { t } from "ttag";
import { push } from "react-router-redux";
import type { Route, InjectedRouter } from "react-router";
import { withRouter } from "react-router";

import Button from "metabase/core/components/Button";
import fitViewport from "metabase/hoc/FitViewPort";
import Modal from "metabase/components/Modal";
import ModalContent from "metabase/components/ModalContent";

import type { PermissionsGraph } from "metabase-types/api";
import { useLeaveConfirmation } from "metabase/hooks/use-leave-confirmation";
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
import type { IconName } from "metabase/core/components/Icon";
import { getIsHelpReferenceOpen } from "metabase/admin/permissions/selectors/help-reference";
import {
  clearSaveError as clearPermissionsSaveError,
  toggleHelpReference,
} from "../../permissions";
import { ToolbarButton } from "../ToolbarButton";
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
  router: InjectedRouter;
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
  router,
  route,
  toolbarRightContent,
  helpContent,
}: PermissionsPageLayoutProps) {
  const saveError = useSelector(state => state.admin.permissions.saveError);

  const isHelpReferenceOpen = useSelector(getIsHelpReferenceOpen);
  const dispatch = useDispatch();

  const navigateToTab = (tab: PermissionsPageTab) =>
    dispatch(push(`/admin/permissions/${tab}`));
  const clearSaveError = () => dispatch(clearPermissionsSaveError());

  const handleToggleHelpReference = useCallback(() => {
    dispatch(toggleHelpReference());
  }, [dispatch]);

  const beforeLeaveConfirmation = useLeaveConfirmation({
    router,
    route,
    isEnabled: isDirty,
  });

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

        {beforeLeaveConfirmation}

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
    </PermissionPageRoot>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(fitViewport, withRouter)(PermissionsPageLayout);
