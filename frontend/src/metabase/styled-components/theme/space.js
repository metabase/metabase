import { SPACE_LEVELS as levels } from "./constants";

/**
 * Returns a pixel amount: 4px, 8px, 16px, on to 128px
 * @param {number} level must be an integer between 0 and 5
 * @returns {string}
 */
export function space(level = 0) {
  const spaceInteger = levels[level];

  return spaceInteger || "";
}
