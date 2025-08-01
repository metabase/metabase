import { useDisclosure } from "@mantine/hooks";
import { push } from "react-router-redux";
import { t } from "ttag";

import EmptyDashboardBot from "assets/img/dashboard-empty.svg";
import { ForwardRefLink } from "metabase/common/components/Link";
import {
  QuestionPickerModal,
  type QuestionPickerValueItem,
} from "metabase/common/components/Pickers/QuestionPicker";
import { useDispatch } from "metabase/lib/redux";
import { Button, Flex, Icon, Menu, Text, Title } from "metabase/ui";
import {
  getNewTransformFromCardUrl,
  getNewTransformFromTypeUrl,
} from "metabase-enterprise/transforms/urls";

export function NewTransformPage() {
  return (
    <Flex direction="column" justify="center" align="center" h="100%">
      <Flex direction="column" justify="center" align="center">
        <img
          src={EmptyDashboardBot}
          alt={t`Empty dashboard`}
          width={96}
          height={96}
        />
        <Title order={3} c="text-secondary" mt="md" ta="center">
          {t`Create custom views and tables with transforms`}
        </Title>
        <Text c="text-secondary" mt="sm" mb="xl" ta="center">
          {t`You can write SQL, use the query builder, or an existing query.`}
        </Text>
        <NewTransformMenu />
      </Flex>
    </Flex>
  );
}

function NewTransformMenu() {
  const dispatch = useDispatch();
  const [isPickerOpened, { open: openPicker, close: closePicker }] =
    useDisclosure();

  const handlePickerChange = (item: QuestionPickerValueItem) => {
    dispatch(push(getNewTransformFromCardUrl(item.id)));
  };

  return (
    <>
      <Menu>
        <Menu.Target>
          <Button variant="filled">{t`Create a transform`}</Button>
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
        />
      )}
    </>
  );
}
