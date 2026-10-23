import { useMemo } from "react";

import { useGetBugReportDetailsQuery } from "metabase/api/bug-report";

import { navigatorInfo } from "./utils";

export function useDiagnosticInfo() {
  const { data: bugReportDetails } = useGetBugReportDetailsQuery();

  return useMemo(() => {
    const details = { "browser-info": navigatorInfo(), ...bugReportDetails };
    return {
      diagnosticInfo: JSON.stringify(details, null, 2),
      compactDiagnosticInfo: encodeURIComponent(JSON.stringify(details)),
    };
  }, [bugReportDetails]);
}
