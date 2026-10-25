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
  isEmbeddingHubPermissions,
  showRevisionChangedModal,
} from "metabase/permissions";
import { useSelector } from "metabase/redux";
import { useNavigate } from "metabase/router";
import { useUserSetting } from "metabase/settings";
import {
  Flex,
  Icon,
  Button as NewButton,
  Modal as NewModal,
  Text,
} from "metabase/ui";

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
  saveError?: string | null;
  onClearSaveError?: () => void;
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
  saveError,
  onClearSaveError,
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

  const showRefreshModal = useSelector(showRevisionChangedModal);

  const [isHelpReferenceOpen, setIsHelpReferenceOpen] = useState(false);
  const navigate = useNavigate();

  const navigateToTab = (tab: PermissionsPageTab) =>
    navigate(`${getPermissionsBasePath()}/${tab}`);

  const handleToggleHelpReference = useCallback(() => {
    setIsHelpReferenceOpen((isOpen) => !isOpen);
  }, []);

  const handleDimissSplitPermsModal = () => {
    setIsSplitPermsModalDismissed(true);
    setShowModalSetting(false);
  };

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
          onClose={() => onClearSaveError?.()}
          onConfirm={() => onClearSaveError?.()}
          title={t`There was an error saving`}
          message={saveError}
          confirmButtonText={t`OK`}
          confirmButtonProps={{ variant: "default", color: "neutral" }}
          closeButtonText={null}
        />

        <Flex
          className={CS.borderBottom}
          justify="space-between"
          align="center"
        >
          <PermissionsTabs tab={tab} onChangeTab={navigateToTab} />
          <Flex
            pl="lg"
            pr={
              isEmbeddingHubPermissions()
                ? `calc(${CONTENT_PADDING_X} - 0.75rem)`
                : "lg"
            }
          >
            {helpContent && !isHelpReferenceOpen && (
              <ToolbarButton
                text={t`Permissions help`}
                icon="info"
                onClick={handleToggleHelpReference}
              />
            )}
          </Flex>
        </Flex>

        <Flex className={CS.overflowHidden} h="100%">
          {children}
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
