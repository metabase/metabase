import MetabaseSettings from "metabase/lib/settings";
import type { PasswordComplexity } from "metabase-types/api";

const LOWER = "abcdefghijklmnopqrstuvwxyz";
const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIGITS = "0123456789";
const SPECIAL = "!@#$%^&*()-_+=";
const ALL = LOWER + UPPER + DIGITS + SPECIAL;

function randomIndex(max: number): number {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return array[0] % max;
}

function randomChar(charset: string): string {
  return charset[randomIndex(charset.length)];
}

// generate a password that satisfies `complexity` requirements, by default the ones that come back in the
// `password-complexity` Setting; must be a map like {total: 6, digit: 1}
export const generatePassword = (
  complexityParam?: PasswordComplexity,
): string => {
  const complexity =
    complexityParam || MetabaseSettings.passwordComplexityRequirements() || {};

  // generated password must be at least `complexity.total`, but can be longer
  // so hard code a minimum of 14
  const len = Math.max(complexity.total || 0, 14);

  const chars: string[] = [];

  // seed required characters from each category to guarantee requirements are met
  for (let i = 0; i < (complexity.lower || 0); i++) {
    chars.push(randomChar(LOWER));
  }
  for (let i = 0; i < (complexity.upper || 0); i++) {
    chars.push(randomChar(UPPER));
  }
  for (let i = 0; i < (complexity.digit || 0); i++) {
    chars.push(randomChar(DIGITS));
  }
  for (let i = 0; i < (complexity.special || 0); i++) {
    chars.push(randomChar(SPECIAL));
  }

  // fill remaining length with random characters from full charset
  while (chars.length < len) {
    chars.push(randomChar(ALL));
  }

  // Fisher-Yates shuffle to avoid required chars clustering at the start
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join("");
};
