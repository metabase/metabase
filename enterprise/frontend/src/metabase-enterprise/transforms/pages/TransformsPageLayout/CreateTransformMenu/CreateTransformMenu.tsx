import { useDisclosure } from "@mantine/hooks";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import { QuestionPickerModal } from "metabase/common/components/Pickers/QuestionPicker";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_TRANSFORMS_PYTHON } from "metabase/plugins";
import { Button, Center, Icon, Loader, Menu } from "metabase/ui";

import { shouldDisableItem } from "./utils";

export const CreateTransformMenu = () => {
  const dispatch = useDispatch();
  const [isPickerOpened, { open: openPicker, close: closePicker }] =
    useDisclosure();

  const { data: databases, isLoading } = useListDatabasesQuery({
    include_analytics: true,
  });

  return (
    <>
      <Menu position="bottom-end">
        <Menu.Target>
          <Button
            p="sm"
            w={36}
            h={36}
            leftSection={<Icon name="add" size={16} />}
          />
        </Menu.Target>
        <Menu.Dropdown>
          {isLoading ? (
            <Center>
              <Loader size="sm" />
            </Center>
          ) : (
            <>
              <Menu.Item
                leftSection={<Icon name="notebook" />}
                onClick={() => dispatch(push(Urls.newQueryTransform()))}
              >
                {t`Query builder`}
              </Menu.Item>
              <Menu.Item
                leftSection={<Icon name="sql" />}
                onClick={() => dispatch(push(Urls.newNativeTransform()))}
              >
                {t`SQL query`}
              </Menu.Item>
              {PLUGIN_TRANSFORMS_PYTHON.isEnabled && (
                <Menu.Item
                  leftSection={<Icon name="code_block" />}
                  onClick={() => dispatch(push(Urls.newPythonTransform()))}
                >
                  {t`Python script`}
                </Menu.Item>
              )}
              <Menu.Item
                leftSection={<Icon name="folder" />}
                onClick={openPicker}
              >
                {t`Copy of a saved question`}
              </Menu.Item>
            </>
          )}
        </Menu.Dropdown>
      </Menu>

      {isPickerOpened && (
        <QuestionPickerModal
          title={t`Pick a question`}
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
    </>
  );
};
