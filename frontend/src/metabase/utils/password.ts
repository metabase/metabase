import { msgid, ngettext, t } from "ttag";

import MetabaseSettings from "metabase/utils/settings";
import { numberToWord } from "metabase/utils/utils";
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

const n2w = (n: number) => numberToWord(n);

function makeRegexTest(property: string, regex: RegExp) {
  return (requirements: Record<string, any>, password = "") =>
    (password.match(regex) || []).length >= (requirements[property] || 0);
}

const PASSWORD_COMPLEXITY_CLAUSES = {
  total: {
    test: ({ total = 0 }, password = "") => password.length >= total,
    description: ({ total = 0 }) =>
      ngettext(
        msgid`at least ${n2w(total)} character long`,
        `at least ${n2w(total)} characters long`,
        total,
      ),
  },
  lower: {
    test: makeRegexTest("lower", /[a-z]/g),
    description: ({ lower = 0 }) =>
      ngettext(
        msgid`${n2w(lower)} lower case letter`,
        `${n2w(lower)} lower case letters`,
        lower,
      ),
  },
  upper: {
    test: makeRegexTest("upper", /[A-Z]/g),
    description: ({ upper = 0 }) =>
      ngettext(
        msgid`${n2w(upper)} upper case letter`,
        `${n2w(upper)} upper case letters`,
        upper,
      ),
  },
  digit: {
    test: makeRegexTest("digit", /[0-9]/g),
    description: ({ digit = 0 }) =>
      ngettext(msgid`${n2w(digit)} number`, `${n2w(digit)} numbers`, digit),
  },
  special: {
    test: makeRegexTest("special", /[^a-zA-Z0-9]/g),
    description: ({ special = 0 }) =>
      ngettext(
        msgid`${n2w(special)} special character`,
        `${n2w(special)} special characters`,
        special,
      ),
  },
};

/**
 * Returns a description of password complexity requirements.
 * Optionally takes a password and returns a description only including the requirements not met.
 */
export function passwordComplexityDescription(
  password = "",
  requirements: PasswordComplexity = MetabaseSettings.passwordComplexityRequirements(),
) {
  const descriptions: Record<string, string> = {};

  for (const [name, clause] of Object.entries(PASSWORD_COMPLEXITY_CLAUSES)) {
    if (!clause.test(requirements, password)) {
      descriptions[name] = clause.description(requirements);
    }
  }

  const { total, ...rest } = descriptions;
  const includes = Object.values(rest).join(", ");

  if (total && includes) {
    return t`must be ${total} and include ${includes}.`;
  } else if (total) {
    return t`must be ${total}.`;
  } else if (includes) {
    return t`must include ${includes}.`;
  } else {
    return null;
  }
}
