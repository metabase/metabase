import type { DashCard } from "metabase-types/types/Dashboard";

export const GRID_WIDTH = 18;
export const GRID_ASPECT_RATIO = 4 / 3;

const MOBILE_BREAKPOINT = 752;

export const GRID_BREAKPOINTS = {
  desktop: MOBILE_BREAKPOINT + 1,
  mobile: MOBILE_BREAKPOINT,
};

export const GRID_COLUMNS = {
  desktop: GRID_WIDTH,
  mobile: 1,
};

export function isMobileBreakpoint(breakpoint) {
  const width = GRID_BREAKPOINTS[breakpoint];
  return width <= MOBILE_BREAKPOINT;
}

export const DEFAULT_CARD_SIZE = { width: 4, height: 4 };

export const MIN_ROW_HEIGHT = 54;

type DashCardPosition = {
  col: number,
  row: number,
  sizeY: number,
  sizeX: number,
};

// returns the first available position from left to right, top to bottom,
// based on the existing cards,  item size, and grid width
export function getPositionForNewDashCard(
  cards: Array<DashCard>,
  sizeX: number = DEFAULT_CARD_SIZE.width,
  sizeY: number = DEFAULT_CARD_SIZE.height,
  width: number = GRID_WIDTH,
): DashCardPosition {
  let row = 0;
  let col = 0;
  while (row < 1000) {
    while (col <= width - sizeX) {
      let good = true;
      const position = { col, row, sizeX, sizeY };
      for (const card of cards) {
        if (intersects(card, position)) {
          good = false;
          break;
        }
      }
      if (good) {
        return position;
      }
      col++;
    }
    col = 0;
    row++;
  }
  // this should never happen but flow complains if we return undefined
  return { col, row, sizeX, sizeY };
}

function intersects(a: DashCardPosition, b: DashCardPosition): boolean {
  return !(
    b.col >= a.col + a.sizeX ||
    b.col + b.sizeX <= a.col ||
    b.row >= a.row + a.sizeY ||
    b.row + b.sizeY <= a.row
  );
}

// for debugging
/*eslint-disable */
function printGrid(cards, width) {
  let grid = [];
  for (let card of cards) {
    for (let col = card.col; col < card.col + card.sizeX; col++) {
      for (let row = card.row; row < card.row + card.sizeY; row++) {
        grid[row] =
          grid[row] ||
          Array(width)
            .join(".")
            .split(".")
            .map(() => 0);
        grid[row][col]++;
      }
    }
  }
  console.log("\n" + grid.map(row => row.join(".")).join("\n") + "\n");
}
/*eslint-enable */
