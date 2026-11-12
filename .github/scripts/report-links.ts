// usage: bun report-links.ts <report.md>
// A non-empty report opens the Linear issue or replaces its description; an empty or missing one closes it.
import { existsSync, readFileSync } from "node:fs";

import { reportIssue } from "./report-issue";

const file = process.argv[2];

await reportIssue({
  title: "metabase/metabase broken links report",
  report: file && existsSync(file) ? readFileSync(file, "utf8").trim() : "",
  opened: (link) =>
    `:link: The weekly link check found broken links in metabase/metabase: ${link}`,
  closed: (link) =>
    `:white_check_mark: All links in metabase/metabase pass again, closed ${link}`,
  closedComment: `All links pass as of ${process.env.RUN_URL}`,
});
