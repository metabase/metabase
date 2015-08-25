"use strict";

// returns the first available position from left to right, top to bottom,
// based on the existing cards,  item size, and grid width
export function getPositionForNewDashCard(cards, sizeX = 2, sizeY = 2, width = 6) {
    let row = 0;
    let col = 0;
    while (row < 1000) {
        while (col < width) {
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
