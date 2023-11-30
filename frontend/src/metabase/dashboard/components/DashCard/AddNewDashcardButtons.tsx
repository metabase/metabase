import type { BoxProps } from "metabase/ui";
import { Box, Button, Menu } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";
import { useDispatch, useSelector } from "metabase/lib/redux";
import {
  addCardToDashboard,
  addHeadingDashCardToDashboard,
  addMarkdownDashCardToDashboard,
  addLinkDashCardToDashboard,
} from "metabase/dashboard/actions";
import { getDashboard, getSelectedTabId } from "metabase/dashboard/selectors";
import type { BaseDashboardCard } from "metabase-types/api";

type Position = "top" | "right" | "bottom" | "left";

interface AddNewDashcardButtonProps {
  position: Position;
  dashcard: BaseDashboardCard;
}

function getBoxProps(position: Position): BoxProps {
  if (position === "top") {
    return {
      top: "-0.5rem",
      left: "1rem",
    };
  }
  if (position === "right") {
    return {
      top: "50%",
      right: "-0.5rem",
    };
  }
  if (position === "bottom") {
    return {
      bottom: "-0.5rem",
      left: "50%",
    };
  }
  return {
    top: "50%",
    left: "-0.5rem",
  };
}

function getNewDashcardCoords(position: Position, dashcard: BaseDashboardCard) {
  if (position === "top") {
    return {
      col: dashcard.col,
      row: Math.max(0, dashcard.row - 1),
    };
  }
  if (position === "right") {
    return {
      col: dashcard.col + dashcard.size_x,
      row: dashcard.row,
    };
  }
  if (position === "bottom") {
    return {
      col: dashcard.col,
      row: dashcard.row + 1,
    };
  }
  return {
    col: Math.max(0, dashcard.col - 1),
    row: dashcard.row,
  };
}

export function AddNewDashcardButton({
  position,
  dashcard,
}: AddNewDashcardButtonProps) {
  const dispatch = useDispatch();

  const dashId = useSelector(getDashboard).id;
  const tabId = useSelector(getSelectedTabId);

  const newDashCardPosition = getNewDashcardCoords(position, dashcard);

  const handleAddQuestion = () => {
    dispatch(
      addCardToDashboard({
        dashId,
        cardId: 1,
        tabId,
        position: newDashCardPosition,
      }),
    );
  };

  const handleAddHeading = () => {
    dispatch(
      addHeadingDashCardToDashboard({
        dashId,
        tabId,
        position: newDashCardPosition,
      }),
    );
  };

  const handleAddText = () => {
    dispatch(
      addMarkdownDashCardToDashboard({
        dashId,
        tabId,
        position: newDashCardPosition,
      }),
    );
  };

  const handleAddLink = () => {
    dispatch(
      addLinkDashCardToDashboard({
        dashId,
        tabId,
        position: newDashCardPosition,
      }),
    );
  };

  return (
    <Box className="hover-child" pos="absolute" {...getBoxProps(position)}>
      <Menu>
        <Menu.Target>
          <Button
            variant="filled"
            leftIcon={<Icon name="add" />}
            radius="xl"
            style={{ padding: 0 }}
          />
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            icon={<Icon name="insight" size={18} />}
            onClick={handleAddQuestion}
          >
            Question
          </Menu.Item>
          <Menu.Item
            icon={<Icon name="string" size={24} />}
            onClick={handleAddHeading}
          >
            Heading
          </Menu.Item>
          <Menu.Item
            icon={<Icon name="string" size={16} />}
            onClick={handleAddText}
          >
            Text
          </Menu.Item>
          <Menu.Item
            icon={<Icon name="link" size={18} />}
            onClick={handleAddLink}
          >
            Link
          </Menu.Item>
          <Menu.Item icon={<Icon name="click" size={18} />} disabled>
            Action
          </Menu.Item>
          <Menu.Item icon={<Icon name="filter" size={18} />} disabled>
            Filter
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </Box>
  );
}
