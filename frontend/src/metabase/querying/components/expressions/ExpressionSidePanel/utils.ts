import { t } from "ttag";

import { hasRequiredFeature } from "metabase/databases";
import {
  type ExpressionSuggestion,
  FUNCTION_ALIASES,
  fuzzyMatcher,
  getClauseDefinition,
  getHelpText,
  getMBQLName,
} from "metabase/querying/expressions";
import type * as Lib from "metabase-lib";
import type { Database } from "metabase-types/api";

import {
  type SidePanelIconName,
  type SidePanelItem,
  type SidePanelTab,
  TIME_FUNCTIONS,
  getSidePanelSections,
} from "./content";

export type SidePanelRow =
  | {
      type: "template";
      key: string;
      name: string;
      code: string;
      icon: SidePanelIconName;
      /** Why the row matches the search, when its name does not show it. */
      hint?: string;
    }
  | {
      type: "function";
      key: string;
      /** The clause name, which the editor inserts by. */
      name: string;
      displayName: string;
      icon: SidePanelIconName;
      /** The database lacks a feature the function needs. */
      isDisabled: boolean;
      hint?: string;
    };

export type SidePanelSectionView = {
  name: string;
  blocks: SidePanelRow[][];
};

type Options = {
  expressionMode: Lib.ExpressionMode;
  tab: SidePanelTab;
  database: Pick<Database, "engine" | "features"> | undefined;
  search: string;
  /** Functions whose meaning matches the search, by their clause names. */
  relatedNames?: string[];
};

/**
 * The sections of one tab, with functions resolved against the database and
 * everything filtered by the search. A row matches like an option of
 * autocomplete: by its name, an alias, an abbreviation or with a typo. It
 * also matches by its section's name, a function's description, or by
 * meaning, with `relatedNames`.
 */
export function getSidePanelView({
  expressionMode,
  tab,
  database,
  search,
  relatedNames = [],
}: Options): SidePanelSectionView[] {
  const query = search.trim().toLowerCase();
  const matches = (text: string) => text.toLowerCase().includes(query);

  const describes = (row: SidePanelRow) => {
    if (row.type !== "function" || database == null) {
      return false;
    }
    // Descriptions are Markdown, with `$name` marking argument names.
    const description = getHelpText(row.name, database)?.description;
    return description != null && matches(description.replace(/[`$]/g, ""));
  };

  const sections = getSidePanelSections(expressionMode, tab).map((section) => ({
    name: section.name,
    blocks: section.blocks.map((items) =>
      items.flatMap((item, index) =>
        toRow(item, `${section.name}-${index}`, section.icon, database),
      ),
    ),
  }));
  if (query === "") {
    return sections;
  }

  // One search over all rows, so that typos match only when nothing else
  // does, like in autocomplete.
  const rows = sections.flatMap((section) => section.blocks.flat());
  const textMatches = new Map(
    fuzzyMatcher(rows.map(toOption))(query).map((option) => [
      option.label,
      option,
    ]),
  );
  const related = new Set(relatedNames);

  return sections.flatMap((section) => {
    const sectionMatches = matches(section.name);
    const blocks = section.blocks
      .map((rows) =>
        rows.flatMap((row): SidePanelRow[] => {
          const textMatch = textMatches.get(getRowName(row));
          if (sectionMatches || textMatch != null || describes(row)) {
            return [{ ...row, hint: textMatch?.hint }];
          }
          if (row.type === "function" && related.has(row.name)) {
            return [{ ...row, hint: t`related` }];
          }
          return [];
        }),
      )
      .filter((rows) => rows.length > 0);

    return blocks.length > 0 ? [{ name: section.name, blocks }] : [];
  });
}

function getRowName(row: SidePanelRow) {
  return row.type === "function" ? row.displayName : row.name;
}

/**
 * A row as an option of autocomplete, for its text matcher. A function in
 * several sections matches in each of them.
 */
function toOption(row: SidePanelRow): ExpressionSuggestion {
  const name = getRowName(row);
  return {
    label: name,
    displayLabel: name,
    icon: "function",
    aliases: row.type === "function" ? FUNCTION_ALIASES[row.name] : undefined,
  };
}

function toRow(
  item: SidePanelItem,
  key: string,
  sectionIcon: SidePanelIconName,
  database: Options["database"],
): SidePanelRow[] {
  if (item.type === "template") {
    return [
      {
        ...item,
        key: `${key}-${item.name}`,
        icon: item.icon ?? sectionIcon,
      },
    ];
  }

  const name = getMBQLName(item.name);
  const clause = name ? getClauseDefinition(name) : undefined;
  if (!clause) {
    return [];
  }
  return [
    {
      type: "function",
      key: `${key}-${clause.name}`,
      name: clause.name,
      displayName: clause.displayName,
      icon: TIME_FUNCTIONS.has(item.name) ? "time" : sectionIcon,
      isDisabled:
        database != null &&
        !hasRequiredFeature(database, clause.requiresFeature),
    },
  ];
}
