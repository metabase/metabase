import { t } from "ttag";

/**
 * Replaces every match of `pattern`, a regular expression, in a URL path.
 * Rules apply in order, each to the previous one's result, with ClickHouse's
 * `replaceRegexpAll`: `\1` in `replacement` is the first group.
 */
export type PathCleaningRule = {
  pattern: string;
  replacement: string;
  /** What the rule is for, in words. */
  description?: string;
};

const ID_SEGMENT = "/:id";

/**
 * Generic rules that suit most sites, with descriptions in the current
 * language.
 *
 * They're written for ClickHouse, the only database the prototype queries:
 * `\1` in the trailing slash rule's replacement is `$1` in Java and MySQL,
 * and `\b` isn't a word boundary everywhere. Other databases need their own
 * version of these. See "Regex dialects" in
 * `dev/product-analytics/context/post-prototype.md`.
 */
export const getDefaultPathCleaningRules = (): PathCleaningRule[] => [
  {
    pattern: "[?#].*$",
    replacement: "",
    description: t`Removes the query string and fragment, as in /pricing?ref=nav#plans.`,
  },
  // Before numbers: a UUID can start with eight digits, which the number rule
  // would replace on their own.
  {
    pattern:
      "/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\\b",
    replacement: ID_SEGMENT,
    description: t`Replaces UUIDs with :id, as in /question/3f2c1a9e-1b2c-4d5e-8f90-123456789abc.`,
  },
  {
    pattern: "/[0-9]+\\b",
    replacement: ID_SEGMENT,
    description: t`Replaces numbers with :id, as in /dashboard/123.`,
  },
  {
    pattern: "(.)/+$",
    replacement: "\\1",
    description: t`Removes a trailing slash, as in /pricing/, but keeps the home page's /.`,
  },
];

/**
 * Whether `value` is a rule. Patterns aren't checked: whether one is valid
 * depends on the database's regular expressions, which the browser's aren't.
 */
const isPathCleaningRule = (value: unknown): value is PathCleaningRule =>
  typeof value === "object" &&
  value !== null &&
  "pattern" in value &&
  "replacement" in value &&
  typeof value.pattern === "string" &&
  value.pattern !== "" &&
  typeof value.replacement === "string" &&
  (!("description" in value) || typeof value.description === "string");

export const isPathCleaningRuleList = (
  value: unknown,
): value is PathCleaningRule[] =>
  Array.isArray(value) && value.every(isPathCleaningRule);
