import type { BoxProps } from "metabase/ui";
import { Box, Button } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";
import type { BaseDashboardCard } from "metabase-types/api";
import { NewDashCardMenu } from "../NewDashCardMenu";

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
  const newDashCardPosition = getNewDashcardCoords(position, dashcard);
  return (
    <Box className="hover-child" pos="absolute" {...getBoxProps(position)}>
      <NewDashCardMenu nextCardPosition={newDashCardPosition}>
        <Button
          variant="filled"
          leftIcon={<Icon name="add" />}
          radius="xl"
          style={{ padding: 0 }}
        />
      </NewDashCardMenu>
    </Box>
  );
}
