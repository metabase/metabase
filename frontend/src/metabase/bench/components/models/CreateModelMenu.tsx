import { t } from "ttag";

import { useListDatabasesQuery } from "metabase/api/database";
import { ForwardRefLink } from "metabase/common/components/Link";
import { newQuestion } from "metabase/lib/urls/questions";
import { getHasNativeWrite } from "metabase/selectors/data";
import { Button, Icon, Menu } from "metabase/ui";

export const CreateModelMenu = () => {
  const { data } = useListDatabasesQuery();
  const hasNativeWrite = getHasNativeWrite(data?.data ?? []);

  return (
    <Menu>
      <Menu.Target>
        <Button
          leftSection={<Icon name="add" />}
          size="sm"
          aria-label={t`Create a new model`}
        />
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>{t`Create your model with…`}</Menu.Label>
        <Menu.Item
          component={ForwardRefLink}
          to={newQuestion({
            mode: "bench",
            creationType: "custom_question",
            cardType: "model",
          })}
          leftSection={<Icon name="notebook" />}
        >
          {t`Query builder`}
        </Menu.Item>
        <Menu.Item
          component={ForwardRefLink}
          disabled={!hasNativeWrite}
          onClick={!hasNativeWrite ? (e) => e.preventDefault() : undefined}
          to={newQuestion({
            mode: "bench",
            DEPRECATED_RAW_MBQL_type: "native",
            creationType: "native_question",
            cardType: "model",
          })}
          leftSection={<Icon name="sql" />}
        >
          {t`SQL query`}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
};
