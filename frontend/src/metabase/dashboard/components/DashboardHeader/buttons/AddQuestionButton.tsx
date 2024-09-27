import { useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { ToolbarButton } from "metabase/components/ToolbarButton";
import { closeSidebar, toggleSidebar } from "metabase/dashboard/actions";
import { SIDEBAR_NAME } from "metabase/dashboard/constants";
import { getDashboard, getSidebar } from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { Flex, Icon, Menu, Text } from "metabase/ui";

export const AddQuestionButton = () => {
  const dispatch = useDispatch();
  const dashboard = useSelector(getDashboard);
  const sidebar = useSelector(getSidebar);

  const [opened, setOpened] = useState(false);
  const handleMenuOpenStateChange = (open: boolean) => {
    if (open && sidebar.name === SIDEBAR_NAME.addQuestion) {
      dispatch(closeSidebar());
    }
    setOpened(open);
  };

  const addQuestionButtonHint =
    !opened && sidebar.name === SIDEBAR_NAME.addQuestion
      ? t`Close sidebar`
      : t`Add questions`;

  const onNewQuestion = (type: "native" | "notebook") => {
    const newQuestionParams =
      type === "notebook"
        ? ({
            mode: "notebook",
            creationType: "custom_question",
          } as const)
        : ({
            mode: "query",
            type: "native",
            creationType: "native_question",
          } as const);

    if (dashboard) {
      dispatch(
        push(
          Urls.newQuestion({
            ...newQuestionParams,
            collectionId: dashboard.collection_id || undefined,
            cardType: "question",
            dashboardId: dashboard.id,
          }),
        ),
      );
    }
  };

  const QUESTION_OPTIONS = [
    {
      key: "notebook",
      title: (
        <Flex align="center" gap="sm">
          <Icon name="insight" />
          {t`New Question`}
        </Flex>
      ),
      action: () => onNewQuestion("notebook"),
    },
    {
      key: "native",
      title: (
        <Flex align="center" gap="sm">
          <Icon name="sql" />
          {t`New SQL query`}
        </Flex>
      ),
      action: () => onNewQuestion("native"),
    },
    {
      key: "existing",
      title: (
        <Flex align="center" gap="sm">
          <Icon name="folder" />
          {t`Existing Question`}
        </Flex>
      ),
      action: () => dispatch(toggleSidebar(SIDEBAR_NAME.addQuestion)),
    },
  ] as const;

  return (
    <Menu
      position="bottom-end"
      opened={opened}
      onChange={handleMenuOpenStateChange}
    >
      <Menu.Target>
        <ToolbarButton
          tooltipLabel={addQuestionButtonHint}
          icon="add"
          isActive={sidebar.name === SIDEBAR_NAME.addQuestion}
          aria-label={addQuestionButtonHint}
        />
      </Menu.Target>
      <Menu.Dropdown miw="auto">
        <Menu.Label>{t`Add a chart from a`}</Menu.Label>
        {QUESTION_OPTIONS.map(({ key, title, action }) => (
          <Menu.Item key={key} onClick={action}>
            <Text pr="xl" fw="bold" color="currentColor">
              {title}
            </Text>
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
};
