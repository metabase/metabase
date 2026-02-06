import { useDisclosure } from "@mantine/hooks";
import { push } from "react-router-redux";
import { t } from "ttag";

import { UpsellGem } from "metabase/admin/upsells/components/UpsellGem";
import { useListDatabasesQuery } from "metabase/api";
import { QuestionPickerModal } from "metabase/common/components/Pickers";
import { useHasTokenFeature } from "metabase/common/hooks";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_TRANSFORMS_PYTHON } from "metabase/plugins";
import { getIsPaidPlan } from "metabase/selectors/settings";
import { getShouldShowPythonTransformsUpsell } from "metabase/transforms/selectors";
import { Button, Center, Icon, Loader, Menu, Tooltip } from "metabase/ui";

import { trackTransformCreate } from "../../analytics";
import { CreateTransformCollectionModal } from "../CreateTransformCollectionModal";

import { shouldDisableItem } from "./utils";

export const CreateTransformMenu = () => {
  const dispatch = useDispatch();
  const [isPickerOpened, { open: openPicker, close: closePicker }] =
    useDisclosure();
  const [
    isCollectionModalOpened,
    { open: openCollectionModal, close: closeCollectionModal },
  ] = useDisclosure();
  const [
    isPythonUpsellOpened,
    { open: openPythonUpsell, close: closePythonUpsell },
  ] = useDisclosure();

  const hasPythonTransformsFeature = useHasTokenFeature("transforms-python");
  const isPaidPlan = useSelector(getIsPaidPlan);

  const shouldShowPythonTransformsUpsell = useSelector(
    getShouldShowPythonTransformsUpsell,
  );

  const { data: databases, isLoading } = useListDatabasesQuery({
    include_analytics: true,
  });

  const handlePythonClick = () => {
    if (hasPythonTransformsFeature) {
      trackTransformCreate({ creationType: "python" });
      dispatch(push(Urls.newPythonTransform()));
    } else {
      openPythonUpsell();
    }
  };

  return (
    <>
      <Menu position="bottom-end">
        <Menu.Target>
          <Tooltip label={t`Create a transform`}>
            <Button
              aria-label={t`Create a transform`}
              leftSection={<Icon name="add" size={16} />}
            >{t`New`}</Button>
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
              <Menu.Item
                leftSection={<Icon name="notebook" />}
                onClick={() => {
                  trackTransformCreate({ creationType: "query" });
                  dispatch(push(Urls.newQueryTransform()));
                }}
              >
                {t`Query builder`}
              </Menu.Item>
              <Menu.Item
                leftSection={<Icon name="sql" />}
                onClick={() => {
                  trackTransformCreate({ creationType: "native" });
                  dispatch(push(Urls.newNativeTransform()));
                }}
              >
                {t`SQL query`}
              </Menu.Item>

              {(shouldShowPythonTransformsUpsell ||
                hasPythonTransformsFeature) && (
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
              {isPaidPlan && (
                <Menu.Item
                  leftSection={<Icon name="code_block" />}
                  rightSection={
                    !hasPythonTransformsFeature ? (
                      <UpsellGem.New size={14} />
                    ) : null
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
            dispatch(push(Urls.newTransformFromCard(item.id)));
            closePicker();
          }}
          onClose={closePicker}
        />
      )}

      {isCollectionModalOpened && (
        <CreateTransformCollectionModal onClose={closeCollectionModal} />
      )}

      <PLUGIN_TRANSFORMS_PYTHON.PythonTransformsUpsellModal
        isOpen={isPythonUpsellOpened}
        onClose={closePythonUpsell}
      />
    </>
  );
};
