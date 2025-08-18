import { useDisclosure } from "@mantine/hooks";
import { push } from "react-router-redux";
import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import {
  type QuestionPickerItem,
  QuestionPickerModal,
  type QuestionPickerValueItem,
} from "metabase/common/components/Pickers/QuestionPicker";
import { useDispatch } from "metabase/lib/redux";
import { Button, Icon, Menu } from "metabase/ui";
import { useDoesDatabaseSupportTransforms } from "metabase-enterprise/transforms/hooks/use-does-database-support-transforms";

import {
  getNewTransformFromCardUrl,
  getNewTransformFromTypeUrl,
} from "../../../urls";

export function CreateTransformMenu() {
  const dispatch = useDispatch();
  const [isPickerOpened, { open: openPicker, close: closePicker }] =
    useDisclosure();

  const handlePickerChange = (item: QuestionPickerValueItem) => {
    dispatch(push(getNewTransformFromCardUrl(item.id)));
  };

  const databaseSupportsTransforms = useDoesDatabaseSupportTransforms();

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
          <Menu.Label>{t`Create your transform with…`}</Menu.Label>
          <Menu.Item
            component={ForwardRefLink}
            to={getNewTransformFromTypeUrl("query")}
            leftSection={<Icon name="notebook" />}
          >
            {t`Query builder`}
          </Menu.Item>
          <Menu.Item
            component={ForwardRefLink}
            to={getNewTransformFromTypeUrl("native")}
            leftSection={<Icon name="sql" />}
          >
            {t`SQL query`}
          </Menu.Item>
          <Menu.Item leftSection={<Icon name="folder" />} onClick={openPicker}>
            {t`A saved question`}
          </Menu.Item>
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
              return !databaseSupportsTransforms(item.database_id);
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
