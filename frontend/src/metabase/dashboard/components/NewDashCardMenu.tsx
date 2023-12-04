import type { ReactNode } from "react";
import { t } from "ttag";
import { Menu } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";
import { useDispatch, useSelector } from "metabase/lib/redux";
import {
  addCardToDashboard,
  addHeadingDashCardToDashboard,
  addMarkdownDashCardToDashboard,
  addLinkDashCardToDashboard,
} from "metabase/dashboard/actions";
import { getDashboard, getSelectedTabId } from "metabase/dashboard/selectors";

interface NewDashCardMenuProps {
  nextCardPosition: { col: number; row: number };
  children: ReactNode;
}

export function NewDashCardMenu({
  nextCardPosition,
  children,
}: NewDashCardMenuProps) {
  const dispatch = useDispatch();

  const dashId = useSelector(getDashboard).id;
  const tabId = useSelector(getSelectedTabId);

  const handleAddQuestion = () => {
    dispatch(
      addCardToDashboard({
        dashId,
        cardId: 1,
        tabId,
        position: nextCardPosition,
      }),
    );
  };

  const handleAddHeading = () => {
    dispatch(
      addHeadingDashCardToDashboard({
        dashId,
        tabId,
        position: nextCardPosition,
      }),
    );
  };

  const handleAddText = () => {
    dispatch(
      addMarkdownDashCardToDashboard({
        dashId,
        tabId,
        position: nextCardPosition,
      }),
    );
  };

  const handleAddLink = () => {
    dispatch(
      addLinkDashCardToDashboard({
        dashId,
        tabId,
        position: nextCardPosition,
      }),
    );
  };

  return (
    <Menu>
      <Menu.Target>{children}</Menu.Target>
      <Menu.Dropdown>
        <Menu.Item icon={<Icon name="insight" />} onClick={handleAddQuestion}>
          {t`Question`}
        </Menu.Item>
        <Menu.Item icon={<Icon name="string" />} onClick={handleAddHeading}>
          {t`Heading`}
        </Menu.Item>
        <Menu.Item icon={<Icon name="list" />} onClick={handleAddText}>
          {t`Text box`}
        </Menu.Item>
        <Menu.Item icon={<Icon name="link" />} onClick={handleAddLink}>
          {t`Link`}
        </Menu.Item>
        <Menu.Item icon={<Icon name="filter" />} disabled>
          {t`Filter`}
        </Menu.Item>
        <Menu.Item icon={<Icon name="click" />} disabled>
          {t`Button`}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
