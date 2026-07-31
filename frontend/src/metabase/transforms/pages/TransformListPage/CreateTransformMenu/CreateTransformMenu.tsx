import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import { QuestionPickerModal } from "metabase/common/components/Pickers";
import { UpsellGem } from "metabase/common/components/upsells/components/UpsellGem";
import { useHasTokenFeature } from "metabase/common/hooks";
import {
  useMetabotAgent,
  useMetabotName,
  useUserMetabotPermissions,
} from "metabase/metabot/hooks";
import { PLUGIN_REMOTE_SYNC } from "metabase/plugins";
import { useDispatch, useSelector } from "metabase/redux";
import { push } from "metabase/router";
import { getShouldShowPythonTransformsUpsell } from "metabase/transforms/selectors";
import { Button, Center, Icon, Loader, Menu, Tooltip } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { RemoteSyncWorktreeId } from "metabase-types/api";

import { trackTransformCreate } from "../../../analytics";
import { CreateTransformCollectionModal } from "../../../components/CreateTransformCollectionModal";

import { shouldDisableItem } from "./utils";

type CreateTransformMenuProps = {
  worktreeId?: RemoteSyncWorktreeId | null;
};

export const CreateTransformMenu = ({
  worktreeId = null,
}: CreateTransformMenuProps) => {
  const dispatch = useDispatch();
  const [isPickerOpened, { open: openPicker, close: closePicker }] =
    useDisclosure();
  const [
    isCollectionModalOpened,
    { open: openCollectionModal, close: closeCollectionModal },
  ] = useDisclosure();

  const hasPythonTransformsFeature = useHasTokenFeature("transforms-python");
  const shouldShowPythonTransformsUpsell = useSelector(
    getShouldShowPythonTransformsUpsell,
  );

  const { data: databases, isLoading } = useListDatabasesQuery({
    include_analytics: true,
  });
  const shouldShowPythonScriptOption =
    hasPythonTransformsFeature || shouldShowPythonTransformsUpsell;
  const isRemoteSyncReadOnly = useSelector(
    PLUGIN_REMOTE_SYNC.getIsRemoteSyncReadOnly,
  );

  const metabot = useMetabotAgent("omnibot");
  const metabotName = useMetabotName();
  const { hasMetabotAccess } = useUserMetabotPermissions();

  const handleMetabotClick = () => {
    trackTransformCreate({ creationType: "metabot" });
    metabot.setPrompt(t`Create a transform that `);
    metabot.setVisible(true);
  };

  const isWorktreeView = worktreeId != null;
  const newTransformParams = { worktreeId: worktreeId ?? undefined };

  const handlePythonClick = () => {
    dispatch(push(Urls.newPythonTransform(newTransformParams))); // Route will show upsell modal if feature is not enabled

    if (hasPythonTransformsFeature) {
      trackTransformCreate({ creationType: "python" });
    }
  };

  // A worktree is an admin's working copy of its branch, so read-only sync does not apply inside it.
  if (isRemoteSyncReadOnly && !isWorktreeView) {
    return (
      <Tooltip
        label={t`Transforms can't be created when Remote Sync is in read-only mode`}
      >
        <Button
          aria-label={t`Create a transform`}
          disabled
          leftSection={<Icon name="add" size={16} />}
        >
          {t`New`}
        </Button>
      </Tooltip>
    );
  }

  return (
    <>
      <Menu position="bottom-end">
        <Menu.Target>
          <Tooltip label={t`Create a transform`}>
            <Button
              aria-label={t`Create a transform`}
              leftSection={<Icon name="add" size={16} />}
            >
              {t`New`}
            </Button>
          </Tooltip>
        </Menu.Target>
        <Menu.Dropdown>
          {isLoading ? (
            <Center>
              <Loader size="sm" />
            </Center>
          ) : (
            <>
              <Menu.Label>{t`Create your transform with…`}</Menu.Label>
              {hasMetabotAccess && !isWorktreeView && (
                <Menu.Item
                  leftSection={<Icon name="metabot" />}
                  onClick={handleMetabotClick}
                >
                  {metabotName}
                </Menu.Item>
              )}
              <Menu.Item
                leftSection={<Icon name="notebook" />}
                onClick={() => {
                  trackTransformCreate({ creationType: "query" });
                  dispatch(push(Urls.newQueryTransform(newTransformParams)));
                }}
              >
                {t`Query builder`}
              </Menu.Item>
              <Menu.Item
                leftSection={<Icon name="sql" />}
                onClick={() => {
                  trackTransformCreate({ creationType: "native" });
                  dispatch(push(Urls.newNativeTransform(newTransformParams)));
                }}
              >
                {t`SQL query`}
              </Menu.Item>

              {shouldShowPythonScriptOption && (
                <Menu.Item
                  leftSection={<Icon name="code_block" />}
                  rightSection={
                    !hasPythonTransformsFeature ? <UpsellGem size={14} /> : null
                  }
                  onClick={handlePythonClick}
                >
                  {t`Python script`}
                </Menu.Item>
              )}
              <Menu.Item
                leftSection={<Icon name="insight" />}
                onClick={() => {
                  trackTransformCreate({ creationType: "saved-question" });
                  openPicker();
                }}
              >
                {t`Copy of a saved question`}
              </Menu.Item>
              {!isWorktreeView && (
                <>
                  <Menu.Divider />
                  <Menu.Item
                    leftSection={<Icon name="folder" />}
                    onClick={openCollectionModal}
                  >
                    {t`Transform folder`}
                  </Menu.Item>
                </>
              )}
            </>
          )}
        </Menu.Dropdown>
      </Menu>

      {isPickerOpened && (
        <QuestionPickerModal
          title={t`Pick a question or a model`}
          models={["card", "dataset"]}
          isDisabledItem={(item) => shouldDisableItem(item, databases?.data)}
          onChange={(item) => {
            dispatch(
              push(Urls.newTransformFromCard(item.id, newTransformParams)),
            );
            closePicker();
          }}
          onClose={closePicker}
        />
      )}

      {isCollectionModalOpened && (
        <CreateTransformCollectionModal onClose={closeCollectionModal} />
      )}
    </>
  );
};
