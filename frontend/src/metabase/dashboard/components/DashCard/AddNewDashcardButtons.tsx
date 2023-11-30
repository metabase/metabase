import type { BoxProps } from "metabase/ui";
import { Box, Button } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { addCardToDashboard } from "metabase/dashboard/actions";
import { getDashboard, getSelectedTabId } from "metabase/dashboard/selectors";
import type { BaseDashboardCard } from "metabase-types/api";

type Position = "top" | "bottom";

interface AddNewDashcardButtonProps {
  position: Position;
  dashcard: BaseDashboardCard;
}

function getBoxProps(position: Position): BoxProps {
  if (position === "top") {
    return {
      top: "-1rem",
      left: "-1rem",
    };
  }
  return {
    bottom: "-1rem",
    left: "-1rem",
  };
}

function getNewDashcardCoords(position: Position, dashcard: BaseDashboardCard) {
  if (position === "top") {
    return {
      col: dashcard.col,
      row: Math.max(0, dashcard.row - 1),
    };
  }
  return {
    col: dashcard.col,
    row: dashcard.row + 1,
  };
}

export function AddNewDashcardButton({
  position,
  dashcard,
}: AddNewDashcardButtonProps) {
  const dispatch = useDispatch();

  const dashId = useSelector(getDashboard).id;
  const tabId = useSelector(getSelectedTabId);

  const handleClick = () => {
    dispatch(
      addCardToDashboard({
        dashId,
        cardId: 1,
        tabId,
        position: getNewDashcardCoords(position, dashcard),
      }),
    );
  };

  return (
    <Box className="hover-child" pos="absolute" {...getBoxProps(position)}>
      <Button
        onClick={handleClick}
        variant="filled"
        leftIcon={<Icon name="add" />}
        radius="xl"
      />
    </Box>
  );
}
