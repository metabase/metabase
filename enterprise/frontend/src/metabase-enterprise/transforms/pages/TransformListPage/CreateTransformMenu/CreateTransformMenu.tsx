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
import { Button, Center, Icon, Loader, Menu } from "metabase/ui";
import { trackTransformCreate } from "metabase-enterprise/transforms/analytics";
import { doesDatabaseSupportTransforms } from "metabase-enterprise/transforms/utils";

import {
  getNewTransformFromCardUrl,
  getNewTransformFromTypeUrl,
} from "../../../urls";

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
    dispatch(push(getNewTransformFromCardUrl(item.id)));
  };

  const { data: databases, isLoading } = useListDatabasesQuery({
    include_analytics: true,
  });

  return (
    <>
      <Menu>
        <Menu.Target>
          <Button
            variant="filled"
            leftSection={<Icon name="add" aria-hidden />}
          >
            {t`Create a transform`}
          </Button>
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
                to={getNewTransformFromTypeUrl("query")}
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
                to={getNewTransformFromTypeUrl("native")}
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
              <Menu.Item
                leftSection={<Icon name="copy" />}
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
          shouldDisableItem={(item: QuestionPickerItem) => {
            if (
              // Disable questions based on unsuppported databases
              item.model === "card" ||
              item.model === "dataset" ||
              item.model === "metric"
            ) {
              const database = databases?.data.find(
                (database) => database.id === item.database_id,
              );
              return !doesDatabaseSupportTransforms(database);
            }

            if (item.model === "dashboard") {
              return true;
            }

            return false;
          }}
        />
      )}
    </>
  );
}
