import { useDisclosure } from "@mantine/hooks";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api";
import { ForwardRefLink } from "metabase/common/components/Link";
import {
  type QuestionPickerItem,
  QuestionPickerModal,
  type QuestionPickerValueItem,
} from "metabase/common/components/Pickers/QuestionPicker";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_TRANSFORMS_PYTHON } from "metabase/plugins";
import { Button, Center, Icon, Loader, Menu } from "metabase/ui";
import type { Database } from "metabase-types/api";

import { trackTransformCreate } from "../../../../analytics";
import { doesDatabaseSupportTransforms } from "../../../../utils";

export function CreateTransformMenu() {
  const dispatch = useDispatch();
  const [isPickerOpened, { open: openPicker, close: closePicker }] =
    useDisclosure();

  const handleSavedQuestionClick = () => {
    openPicker();
    trackTransformCreate({
      triggeredFrom: "transform-page-create-menu",
      creationType: "saved-question",
    });
  };

  const handlePickerChange = (item: QuestionPickerValueItem) => {
    closePicker();
    dispatch(push(Urls.newTransformFromCard(item.id)));
  };

  const { data: databases, isLoading } = useListDatabasesQuery({
    include_analytics: true,
  });

  return (
    <>
      <Menu position="bottom-start">
        <Menu.Target>
          <Button
            leftSection={<Icon name="add" aria-hidden />}
            size="sm"
            aria-label={t`Create a transform`}
          ></Button>
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
                component={ForwardRefLink}
                to={Urls.newQueryTransform()}
                leftSection={<Icon name="notebook" />}
                onClick={() => {
                  trackTransformCreate({
                    triggeredFrom: "transform-page-create-menu",
                    creationType: "query",
                  });
                }}
              >
                {t`Query builder`}
              </Menu.Item>
              <Menu.Item
                component={ForwardRefLink}
                to={Urls.newNativeTransform()}
                leftSection={<Icon name="sql" />}
                onClick={() => {
                  trackTransformCreate({
                    triggeredFrom: "transform-page-create-menu",
                    creationType: "native",
                  });
                }}
              >
                {t`SQL query`}
              </Menu.Item>
              {PLUGIN_TRANSFORMS_PYTHON.isEnabled && (
                <Menu.Item
                  component={ForwardRefLink}
                  to={Urls.newPythonTransform()}
                  leftSection={<Icon name="code_block" />}
                  onClick={() => {
                    trackTransformCreate({
                      triggeredFrom: "transform-page-create-menu",
                      creationType: "python",
                    });
                  }}
                >
                  {t`Python script`}
                </Menu.Item>
              )}
              <Menu.Item
                leftSection={<Icon name="folder" />}
                onClick={handleSavedQuestionClick}
              >
                {t`A copy of a saved question`}
              </Menu.Item>
            </>
          )}
        </Menu.Dropdown>
      </Menu>
      {isPickerOpened && (
        <QuestionPickerModal
          title={t`Pick a question`}
          models={["card", "dataset"]}
          onChange={handlePickerChange}
          onClose={closePicker}
          shouldDisableItem={(item) => shouldDisableItem(item, databases?.data)}
        />
      )}
    </>
  );
}

function shouldDisableItem(item: QuestionPickerItem, databases?: Database[]) {
  if (
    // Disable questions based on unsuppported databases
    item.model === "card" ||
    item.model === "dataset" ||
    item.model === "metric"
  ) {
    const database = databases?.find(
      (database) => database.id === item.database_id,
    );
    return !doesDatabaseSupportTransforms(database);
  }

  if (item.model === "dashboard") {
    return true;
  }

  return false;
}
