import { useDisclosure } from "@mantine/hooks";
import dayjs from "dayjs";
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
import { Button, Card, Icon, Menu } from "metabase/ui";
import { useListTransformsQuery } from "metabase-enterprise/api";
import { TitleSection } from "metabase-enterprise/transforms/components/TitleSection";
import {
  getNewTransformFromCardUrl,
  getNewTransformFromTypeUrl,
  getTransformUrl,
} from "metabase-enterprise/transforms/urls";
import type { Transform, TransformExecution } from "metabase-types/api";

export function TransformListSection() {
  return (
    <TitleSection label={t`Transforms`} rightSection={<NewTransformMenu />}>
      <TransformList />
    </TitleSection>
  );
}

function TransformList() {
  const { data: transforms = [], isLoading, error } = useListTransformsQuery();
  const dispatch = useDispatch();

  const handleRowClick = (transform: Transform) => {
    dispatch(push(getTransformUrl(transform.id)));
  };

  if (isLoading || error != null) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <Card p={0} shadow="none" withBorder>
      <AdminContentTable
        columnTitles={[t`Name`, t`Target`, t`Last run at`, `Last run status`]}
      >
        {transforms.map((transform) => (
          <tr key={transform.id} onClick={() => handleRowClick(transform)}>
            <td>{transform.name}</td>
            <td>{transform.target.name}</td>
            <td>{getLastRunTime(transform.last_execution)}</td>
            <td>{getLastRunStatus(transform.last_execution)}</td>
          </tr>
        ))}
      </AdminContentTable>
    </Card>
  );
}

function getLastRunTime(execution: TransformExecution | undefined | null) {
  if (execution?.end_time == null) {
    return null;
  }

  return dayjs(execution.end_time).format("lll");
}

function getLastRunStatus(execution: TransformExecution | undefined | null) {
  if (execution == null) {
    return null;
  }

  switch (execution.status) {
    case "started":
      return t`In-progress`;
    case "succeeded":
      return t`Success`;
    case "failed":
      return `Failed`;
    case "timeout":
      return t`Timeout`;
  }
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
