
export const GRID_WIDTH = 18;
export const GRID_ASPECT_RATIO = 4 / 3;
export const GRID_MARGIN = 6;

export const DEFAULT_CARD_SIZE = { width: 4, height: 4 };

// returns the first available position from left to right, top to bottom,
// based on the existing cards,  item size, and grid width
export function getPositionForNewDashCard(cards, sizeX = DEFAULT_CARD_SIZE.width, sizeY = DEFAULT_CARD_SIZE.height, width = GRID_WIDTH) {
    let row = 0;
    let col = 0;
    while (row < 1000) {
        while (col <= width - sizeX) {
            let good = true;
            let position = { col, row, sizeX, sizeY };
            for (let card of cards) {
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
    return null;
}

function intersects(a, b) {
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
                grid[row] = grid[row] || Array(width).join(".").split(".").map(() => 0);
                grid[row][col]++;
            }
        }
    }
    console.log("\n"+grid.map(row => row.join(".")).join("\n")+"\n");
}
/*eslint-enable */
