const LEVELS = [4, 8, 16, 32, 64, 128];

/**
 * Returns a pixel amount: 4px, 8px, 16px, on to 128px
 * @param {number} level must be an integer between 0 and 5
 * @returns {string}
 */
export function space(level = 0) {
  const spaceInteger = LEVELS[level];

  return spaceInteger ? spaceInteger + "px" : "";
}
