import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import { QuestionPickerModal } from "metabase/common/components/Pickers";
import {
  ListSkeleton,
  LoadingSkeleton,
} from "metabase/common/components/Skeletons";
import { UpsellGem } from "metabase/common/components/upsells/components/UpsellGem";
import { useHasTokenFeature } from "metabase/common/hooks";
import { useSelector } from "metabase/redux";
import { useNavigate } from "metabase/router";
import { useTransformPermissions } from "metabase/transforms/hooks/use-transform-permissions";
import { getShouldShowPythonTransformsUpsell } from "metabase/transforms/selectors";
import { Button, Icon, Menu, Skeleton, Tooltip } from "metabase/ui";
import * as Urls from "metabase/urls";

import { trackTransformCreate } from "../../../analytics";
import { CreateTransformCollectionModal } from "../../../components/CreateTransformCollectionModal";

import { shouldDisableItem } from "./utils";

export const CreateTransformMenu = () => {
  const navigate = useNavigate();
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
  const { remoteSyncReadOnly } = useTransformPermissions();

  const handlePythonClick = () => {
    navigate(Urls.newPythonTransform()); // Route will show upsell modal if feature is not enabled

    if (hasPythonTransformsFeature) {
      trackTransformCreate({ creationType: "python" });
    }
  };

  if (remoteSyncReadOnly) {
    return (
      <Tooltip
        label={t`Transforms can't be created when Remote Sync is in read-only mode`}
      >
        <Button
          aria-label={t`Create a transform`}
          disabled
          size="lg"
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
              size="lg"
              leftSection={<Icon name="add" size={16} />}
            >
              {t`New`}
            </Button>
          </Tooltip>
        </Menu.Target>
        <Menu.Dropdown>
          {isLoading ? (
            <LoadingSkeleton w={220} p="sm" gap="lg">
              <Skeleton h={10} w="60%" radius="xs" />
              <ListSkeleton rows={3} />
            </LoadingSkeleton>
          ) : (
            <>
              <Menu.Label>{t`Create your transform with…`}</Menu.Label>
              <Menu.Item
                leftSection={<Icon name="notebook" />}
                onClick={() => {
                  trackTransformCreate({ creationType: "query" });
                  navigate(Urls.newQueryTransform());
                }}
              >
                {t`Query builder`}
              </Menu.Item>
              <Menu.Item
                leftSection={<Icon name="sql" />}
                onClick={() => {
                  trackTransformCreate({ creationType: "native" });
                  navigate(Urls.newNativeTransform());
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
              <Menu.Divider />
              <Menu.Item
                leftSection={<Icon name="folder" />}
                onClick={openCollectionModal}
              >
                {t`Transform folder`}
              </Menu.Item>
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
            navigate(Urls.newTransformFromCard(item.id));
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
