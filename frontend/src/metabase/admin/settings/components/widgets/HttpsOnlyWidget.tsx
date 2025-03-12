import { useCallback, useEffect, useState } from "react";
import { t } from "ttag";

import { useHasTokenFeature, useSetting } from "metabase/common/hooks";

import { AdminSettingInput } from "./AdminSettingInput";

enum Status {
  VERIFIED = "verified",
  CHECKING = "checking",
  NOT_CHECKED = "not_checked",
  FAILED = "failed",
}

export function HttpsOnlyWidget() {
  const isHosted = useHasTokenFeature("hosting");
  const [status, setStatus] = useState<Status>(Status.NOT_CHECKED);
  const siteUrl = useSetting("site-url");

  const isHttps = siteUrl?.startsWith("https://");

  const checkHttps = useCallback(() => {
    const req = new XMLHttpRequest();
    req.timeout = 10000; // don't make the user wait >10s
    req.addEventListener("load", () => setStatus(Status.VERIFIED));
    req.addEventListener("error", () => setStatus(Status.FAILED));
    req.open("GET", siteUrl + "/api/health");
    setStatus(Status.CHECKING);
    req.send();
  }, [siteUrl]);

  useEffect(() => {
    if (isHttps) {
      checkHttps();
    }
  }, [isHttps, checkHttps]);

  if (!isHttps || isHosted) {
    return null;
  }

  if (status === Status.VERIFIED) {
    return (
      <AdminSettingInput
        name="redirect-all-requests-to-https"
        title={t`Redirect to HTTPS`}
        description={t`Redirect all HTTP traffic to HTTPS`}
        inputType="boolean"
      />
    );
  }

  return (
    <div>
      {
        status === Status.CHECKING
          ? t`Checking HTTPS...`
          : status === Status.FAILED
            ? t`It looks like HTTPS is not properly configured`
            : null // NOT_CHECKED
      }
    </div>
  );
}
