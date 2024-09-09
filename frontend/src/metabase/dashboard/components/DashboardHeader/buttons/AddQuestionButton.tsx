import { push } from "react-router-redux";
import { t } from "ttag";

import { ToolbarButton } from "metabase/components/ToolbarButton";
import { toggleSidebar } from "metabase/dashboard/actions";
import { SIDEBAR_NAME } from "metabase/dashboard/constants";
import { getDashboard, getSidebar } from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { Menu, Text } from "metabase/ui";

export const AddQuestionButton = () => {
  const dispatch = useDispatch();
  const dashboard = useSelector(getDashboard);
  const sidebar = useSelector(getSidebar);

  const addQuestionButtonHint =
    sidebar.name === SIDEBAR_NAME.addQuestion
      ? t`Close sidebar`
      : t`Add questions`;

  const onNewQuestion = () =>
    dispatch(
      push(
        Urls.newQuestion({
          mode: "notebook",
          creationType: "custom_question",
          collectionId: dashboard?.collection_id ?? null,
          cardType: "question",
          dashboardId: dashboard.id,
        }),
      ),
    );

  const QUESTION_OPTIONS = [
    {
      title: t`New question`,
      action: onNewQuestion,
    },
    {
      title: t`Existing Question`,
      action: () => dispatch(toggleSidebar(SIDEBAR_NAME.addQuestion)),
    },
  ] as const;

  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <ToolbarButton
          tooltipLabel={addQuestionButtonHint}
          icon="add"
          isActive={sidebar.name === SIDEBAR_NAME.addQuestion}
          aria-label={addQuestionButtonHint}
        />
      </Menu.Target>
      <Menu.Dropdown miw="auto">
        {QUESTION_OPTIONS.map(({ title, action }) => (
          <Menu.Item key={title} onClick={action}>
            <Text pr="xl" fw="bold" color="currentColor">
              {title}
            </Text>
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
};
