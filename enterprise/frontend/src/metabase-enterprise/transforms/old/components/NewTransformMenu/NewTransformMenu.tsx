import { type ReactNode, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import {
  QuestionPickerModal,
  type QuestionPickerValueItem,
} from "metabase/common/components/Pickers/QuestionPicker";
import { useDispatch } from "metabase/lib/redux";
import { Icon, Menu } from "metabase/ui";
import {
  getNewTransformFromCardUrl,
  getNewTransformFromTypeUrl,
} from "metabase-enterprise/transforms/old/utils/urls";

type TransformMenuProps = {
  children: ReactNode;
};

export function NewTransformMenu({ children }: TransformMenuProps) {
  const [isPickerOpened, setIsPickerOpened] = useState(false);
  const dispatch = useDispatch();

  const handlePickerOpen = () => {
    setIsPickerOpened(true);
  };

  const handlePickerClose = () => {
    setIsPickerOpened(false);
  };

  const handleSelectQuestion = (item: QuestionPickerValueItem) => {
    dispatch(push(getNewTransformFromCardUrl(item.id)));
  };

  return (
    <>
      <Menu>
        <Menu.Target>{children}</Menu.Target>
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
          <Menu.Item
            leftSection={<Icon name="folder" />}
            onClick={handlePickerOpen}
          >
            {t`A saved question`}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      {isPickerOpened && (
        <QuestionPickerModal
          title={t`Pick a question`}
          models={["card", "dataset"]}
          onChange={handleSelectQuestion}
          onClose={handlePickerClose}
        />
      )}
    </>
  );
}
