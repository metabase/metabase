import { t } from "ttag";
import type { MenuProps } from "metabase/ui";
import { Menu } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";
import { useDispatch, useSelector } from "metabase/lib/redux";
import {
  addCardToDashboard,
  addHeadingDashCardToDashboard,
  addMarkdownDashCardToDashboard,
  addLinkDashCardToDashboard,
} from "metabase/dashboard/actions";
import type { BaseDashboardCard } from "metabase-types/api";
import { getDashboard, getSelectedTabId } from "metabase/dashboard/selectors";

type Position = Pick<BaseDashboardCard, "col" | "row">;
type Size = Pick<BaseDashboardCard, "size_x" | "size_y">;

interface NewDashCardMenuProps extends MenuProps {
  nextCardPosition: Position & Partial<Size>;
}

export function NewDashCardMenu({
  nextCardPosition,
  children,
  onClose,
  ...props
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
    onClose?.();
  };

  const handleAddHeading = () => {
    dispatch(
      addHeadingDashCardToDashboard({
        dashId,
        tabId,
        position: nextCardPosition,
      }),
    );
    onClose?.();
  };

  const handleAddText = () => {
    dispatch(
      addMarkdownDashCardToDashboard({
        dashId,
        tabId,
        position: nextCardPosition,
      }),
    );
    onClose?.();
  };

  const handleAddLink = () => {
    dispatch(
      addLinkDashCardToDashboard({
        dashId,
        tabId,
        position: nextCardPosition,
      }),
    );
    onClose?.();
  };

  return (
    <Menu {...props} onClose={onClose}>
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
