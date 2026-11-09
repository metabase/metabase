import { hasRequiredFeature } from "metabase/databases";
import { clausesForMode, getHelpText } from "metabase/querying/expressions";
import type * as Lib from "metabase-lib";
import type { Database } from "metabase-types/api";

import {
  FUNCTION_ICONS,
  GROUP_ORDER,
  POPULAR_FUNCTIONS,
  type SidePanelGroupId,
  type SidePanelIconName,
  type SidePanelTemplate,
  type SidePanelTool,
  getSidePanelGroups,
  getSidePanelTools,
} from "./content";

export type SidePanelFunction = {
  /** The clause name, which is what the editor inserts by. */
  name: string;
  displayName: string;
  icon: SidePanelIconName;
  isDisabled: boolean;
};

export type SidePanelGroupView = {
  id: SidePanelGroupId;
  name: string;
  templates: SidePanelTemplate[];
  functions: SidePanelFunction[];
  functionsLabel: string;
};

export type SidePanelSections = {
  tools: SidePanelTool[];
  popular: SidePanelFunction[];
  groups: SidePanelGroupView[];
};

function matchesSearch(name: string, search: string) {
  return name.toLowerCase().includes(search);
}

export function getSidePanelSections({
  expressionMode,
  database,
  search,
}: {
  expressionMode: Lib.ExpressionMode;
  database: Pick<Database, "engine" | "features"> | undefined;
  search: string;
}): SidePanelSections {
  const clausesByName = new Map(
    clausesForMode(expressionMode).map((clause) => [
      clause.displayName,
      clause,
    ]),
  );

  const toFunctions = (displayNames: string[]) =>
    displayNames.flatMap((displayName): SidePanelFunction[] => {
      const clause = clausesByName.get(displayName);
      if (!clause) {
        return [];
      }
      return [
        {
          name: clause.name,
          displayName,
          icon: FUNCTION_ICONS[displayName] ?? "function-general",
          isDisabled:
            database != null &&
            !hasRequiredFeature(database, clause.requiresFeature),
        },
      ];
    });

  const normalizedSearch = search.trim().toLowerCase();
  const isSearching = normalizedSearch !== "";
  const allGroups = getSidePanelGroups();

  const descriptionMatches = (fn: SidePanelFunction) => {
    const description = database
      ? getHelpText(fn.name, database)?.description
      : undefined;
    // Descriptions are Markdown, with `$name` marking argument references.
    return (
      description != null &&
      matchesSearch(description.replace(/[`$]/g, ""), normalizedSearch)
    );
  };

  const groups = GROUP_ORDER[expressionMode].flatMap(
    (id): SidePanelGroupView[] => {
      const group = allGroups[id];
      const groupMatches = matchesSearch(group.name, normalizedSearch);
      const templates = group.templates.filter(
        (template) =>
          template.modes.includes(expressionMode) &&
          (groupMatches || matchesSearch(template.name, normalizedSearch)),
      );
      const functions = toFunctions(group.functions).filter(
        (fn) =>
          groupMatches ||
          matchesSearch(fn.displayName, normalizedSearch) ||
          descriptionMatches(fn),
      );

      if (templates.length === 0 && functions.length === 0) {
        return [];
      }
      return [{ ...group, templates, functions }];
    },
  );

  return {
    tools: isSearching ? [] : getSidePanelTools(expressionMode),
    popular: isSearching ? [] : toFunctions(POPULAR_FUNCTIONS[expressionMode]),
    groups,
  };
}
