import React, { ReactNode, useState } from "react";
import _ from "underscore";
import { t } from "ttag";
import { push } from "react-router-redux";
import { Route, Router, withRouter } from "react-router";

import { Location } from "history";
import { Button } from "metabase/core/components/Button";
import fitViewport from "metabase/hoc/FitViewPort";
import Modal from "metabase/components/Modal";
import ModalContent from "metabase/components/ModalContent";

import { PermissionsGraph } from "metabase-types/api";
import useBeforeUnload from "metabase/hooks/use-before-unload";
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
import { useLeaveConfirmation } from "../../hooks/use-leave-confirmation";
import { clearSaveError as clearPermissionsSaveError } from "../../permissions";
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
  router: typeof Router;
  route: typeof Route;
  navigateToTab: (tab: string) => void;
  helpContent?: ReactNode;
  toolbarRightContent?: ReactNode;
};

const CloseSidebarButtonWithDefault = ({
  name = "close",
  ...props
}: {
  name?: string;
  [key: string]: unknown;
}) => <CloseSidebarButton name={name} {...props} />;

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

  const dispatch = useDispatch();

  const navigateToTab = (tab: PermissionsPageTab) =>
    dispatch(push(`/admin/permissions/${tab}`));
  const navigateToLocation = (location: Location) =>
    dispatch(push(location.pathname));
  const clearSaveError = () => dispatch(clearPermissionsSaveError());

  const [shouldShowHelp, setShouldShowHelp] = useState(false);

  const beforeLeaveConfirmation = useLeaveConfirmation({
    router,
    route,
    onConfirm: navigateToLocation,
    isEnabled: isDirty,
  });
  useBeforeUnload(isDirty);

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
            {helpContent && !shouldShowHelp && (
              <ToolbarButton
                text={t`Permission help`}
                icon="info"
                onClick={() => setShouldShowHelp(prev => !prev)}
              />
            )}
          </ToolbarButtonsContainer>
        </TabsContainer>

        <FullHeightContainer>{children}</FullHeightContainer>
      </PermissionPageContent>

      {shouldShowHelp && (
        <PermissionPageSidebar>
          <CloseSidebarButtonWithDefault
            size={20}
            onClick={() => setShouldShowHelp(prev => !prev)}
          />
          {helpContent}
        </PermissionPageSidebar>
      )}
    </PermissionPageRoot>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(fitViewport, withRouter)(PermissionsPageLayout);
