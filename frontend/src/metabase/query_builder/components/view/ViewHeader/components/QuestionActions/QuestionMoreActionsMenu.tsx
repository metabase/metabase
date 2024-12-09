import { Fragment, type JSX, useMemo, useState } from "react";
import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import Button from "metabase/core/components/Button";
import Tooltip from "metabase/core/components/Tooltip";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { getQuestionExtraActionsConfig } from "metabase/query_builder/components/view/ViewHeader/components/QuestionActions/utils";
import type { QueryModalType } from "metabase/query_builder/constants";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Icon, Menu } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type { DatasetEditorTab, QueryBuilderMode } from "metabase-types/store";

type QuestionMoreActionsMenuProps = {
  question: Question;
  onOpenModal: (modalType: QueryModalType) => void;
  onSetQueryBuilderMode: (
    mode: QueryBuilderMode,
    opts?: {
      shouldUpdateUrl?: boolean;
      datasetEditorTab?: DatasetEditorTab;
    },
  ) => void;
};

export const QuestionMoreActionsMenu = ({
  question,
  onOpenModal,
  onSetQueryBuilderMode,
}: QuestionMoreActionsMenuProps): JSX.Element => {
  const isAdmin = useSelector(getUserIsAdmin);
  const isPublicSharingEnabled = useSetting("enable-public-sharing");

  const [opened, setOpened] = useState(false);

  const dispatch = useDispatch();

  const menuItems = useMemo(
    () =>
      getQuestionExtraActionsConfig({
        question,
        isAdmin,
        isPublicSharingEnabled,
        onOpenModal,
        dispatch,
        onSetQueryBuilderMode,
      }),
    [
      dispatch,
      isAdmin,
      isPublicSharingEnabled,
      onOpenModal,
      onSetQueryBuilderMode,
      question,
    ],
  );

  return (
    <Menu position="bottom-end" opened={opened} onChange={setOpened}>
      <Menu.Target>
        <div>
          <Tooltip tooltip={t`Move, trash, and more...`} isEnabled={!opened}>
            <Button onlyIcon icon="ellipsis" />
          </Tooltip>
        </div>
      </Menu.Target>

      <Menu.Dropdown>
        {menuItems.map(menuItem => {
          if ("component" in menuItem) {
            return <Fragment key={menuItem.key}>{menuItem.component}</Fragment>;
          }

          const {
            key,
            title,
            icon,
            testId,
            withTopSeparator,
            tooltip,
            action,
            disabled,
          } = menuItem;
          return (
            <>
              {withTopSeparator && <Menu.Divider />}
              <Menu.Item
                key={key}
                icon={<Icon name={icon} />}
                disabled={disabled}
                onClick={action}
                data-testid={testId}
              >
                {tooltip ? <Tooltip tooltip={tooltip}>{title}</Tooltip> : title}
              </Menu.Item>
            </>
          );
        })}
      </Menu.Dropdown>
    </Menu>
  );
};
