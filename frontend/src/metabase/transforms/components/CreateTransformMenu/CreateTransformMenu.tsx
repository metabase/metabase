import { useDisclosure } from "@mantine/hooks";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import { QuestionPickerModal } from "metabase/common/components/Pickers/QuestionPicker";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_TRANSFORMS_PYTHON } from "metabase/plugins";
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

  const { data: databases, isLoading } = useListDatabasesQuery({
    include_analytics: true,
  });

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
              {PLUGIN_TRANSFORMS_PYTHON.isEnabled && (
                <Menu.Item
                  leftSection={<Icon name="code_block" />}
                  onClick={() => {
                    trackTransformCreate({ creationType: "python" });
                    dispatch(push(Urls.newPythonTransform()));
                  }}
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
          shouldDisableItem={(item) => shouldDisableItem(item, databases?.data)}
          onChange={(item) => {
            if (item.model === "card") {
              dispatch(push(Urls.newTransformFromCard(item.id)));
              closePicker();
            }
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
