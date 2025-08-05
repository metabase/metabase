import { useDisclosure } from "@mantine/hooks";
import { push } from "react-router-redux";
import { t } from "ttag";

import { AdminContentTable } from "metabase/common/components/AdminContentTable";
import { ForwardRefLink } from "metabase/common/components/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import {
  QuestionPickerModal,
  type QuestionPickerValueItem,
} from "metabase/common/components/Pickers/QuestionPicker";
import { useDispatch } from "metabase/lib/redux";
import { Button, Group, Icon, Menu, Stack, Title } from "metabase/ui";
import { useListTransformsQuery } from "metabase-enterprise/api";
import {
  getNewTransformFromCardUrl,
  getNewTransformFromTypeUrl,
} from "metabase-enterprise/transforms/urls";

export function TransformListSection() {
  return (
    <Stack>
      <Group>
        <Title flex={1} order={4}>{t`Transforms`}</Title>
        <NewTransformMenu />
      </Group>
      <TransformList />
    </Stack>
  );
}

function TransformList() {
  const { data: transforms = [], isLoading, error } = useListTransformsQuery();

  if (isLoading || error != null) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <AdminContentTable
      columnTitles={[t`Name`, t`Target`, t`Last run at`, `Last run status`]}
    >
      {transforms.map((transform) => (
        <tr key={transform.id}>
          <td>{transform.name}</td>
          <td>{transform.target.name}</td>
          <td>1</td>
          <td>2</td>
        </tr>
      ))}
    </AdminContentTable>
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
