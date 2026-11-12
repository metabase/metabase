import { hasRequiredFeature } from "metabase/databases";
import {
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
};

/**
 * The sections of one tab, with functions resolved against the database and
 * everything filtered by the search: a row matches by its name, its section's
 * name, or a function's description.
 */
export function getSidePanelView({
  expressionMode,
  tab,
  database,
  search,
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

  return getSidePanelSections(expressionMode, tab).flatMap((section) => {
    const sectionMatches = query === "" || matches(section.name);

    const blocks = section.blocks
      .map((items) =>
        items
          .flatMap((item, index) =>
            toRow(item, `${section.name}-${index}`, section.icon, database),
          )
          .filter(
            (row) =>
              sectionMatches ||
              matches(row.type === "function" ? row.displayName : row.name) ||
              describes(row),
          ),
      )
      .filter((rows) => rows.length > 0);

    return blocks.length > 0 ? [{ name: section.name, blocks }] : [];
  });
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
