import type { ActionImpl } from "kbar";
import { t } from "ttag";
import _ from "underscore";

export const processResults = (results: (string | ActionImpl)[]) => {
  const groupedResults = _.groupBy(
    results.filter((r): r is ActionImpl => !(typeof r === "string")),
    "section",
  );

  const actions = processSection(t`Actions`, groupedResults["basic"]);
  const search = processSection(t`Search results`, groupedResults["search"]);
  const recent = processSection(t`Recent items`, groupedResults["recent"]);
  const admin = processSection(t`Admin`, groupedResults["admin"]);
  const docs = groupedResults["docs"] || [];

  return [...actions.slice(0, 6), ...search, ...recent, ...admin, ...docs];
};

export const processSection = (sectionName: string, items?: ActionImpl[]) => {
  if (items && items.length > 0) {
    return [sectionName, ...items];
  } else {
    return [];
  }
};
