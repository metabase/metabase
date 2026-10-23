import _ from "underscore";

import * as Urls from "metabase/urls";
import { getBasename } from "metabase/utils/basename";

export function isHelpAssistantPath(pathname: string) {
  return pathname.replace(/\/$/, "") === Urls.adminHelp();
}

export function navigatorInfo() {
  return _.pick(navigator, "language", "platform", "userAgent", "vendor");
}

// Returns an external-link URL (not an API call) so it goes through `basename`
// to support Metabase deployments at a subpath.
export function getConnectionPoolDetailsUrl() {
  const path = "/api/bug-reporting/connection-pool-details";
  return new URL(getBasename() + path, location.origin).href;
}

export function getHelpUrl({
  isPaidPlan,
  versionTag,
  compactDiagnosticInfo,
}: {
  isPaidPlan: boolean;
  versionTag: string | undefined;
  compactDiagnosticInfo: string;
}) {
  return isPaidPlan
    ? `https://www.metabase.com/help-premium?utm_source=in-product&utm_medium=troubleshooting&utm_campaign=help&instance_version=${versionTag}&diag=${compactDiagnosticInfo}`
    : `https://www.metabase.com/help?utm_source=in-product&utm_medium=troubleshooting&utm_campaign=help&instance_version=${versionTag}`;
}

const BUG_REPORT_TEMPLATE = `**Describe the bug**
A clear and concise description of what the bug is.

**Logs**
Please include javascript console and server logs around the time this bug occurred. For information about how to get these, consult our [bug troubleshooting guide](https://metabase.com/docs/latest/troubleshooting-guide/bugs.html)

**To Reproduce**
Steps to reproduce the behavior:
1. Go to '...'
2. Click on '....'
3. Scroll down to '....'
4. See error

**Expected behavior**
A clear and concise description of what you expected to happen.

**Screenshots**
If applicable, add screenshots to help explain your problem.

**Severity**
How severe an issue is this bug to you? Is this annoying, blocking some users, blocking an upgrade or blocking your usage of Metabase entirely?
Note: the more honest and specific you are here the more we will take you seriously.

**Additional context**
Add any other context about the problem here.

**Metabase Diagnostic Info**
`;

export function getGithubIssueUrl(diagnosticInfo: string) {
  return (
    "https://github.com/metabase/metabase/issues/new?title=&labels=.Needs+Triage%2C+Type%3ABug&body=" +
    encodeURIComponent(
      BUG_REPORT_TEMPLATE + "\n```json\n" + diagnosticInfo + "\n```",
    )
  );
}
