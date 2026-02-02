import { useCallback, useEffect, useState } from "react";
import { t } from "ttag";

import { useAdminSetting } from "metabase/api/utils";
import { useHasTokenFeature } from "metabase/common/hooks";
import { fetchWithTimeout } from "metabase/lib/fetchWithTimeout";

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
  const { value: siteUrl, description } = useAdminSetting("site-url");

  const isHttps = siteUrl?.startsWith("https://");

  const checkHttps = useCallback(() => {
    setStatus(Status.CHECKING);
    fetchWithTimeout(siteUrl + "/api/health", { timeout: 10000 })
      .then((response) => {
        if (response.ok) {
          setStatus(Status.VERIFIED);
        } else {
          setStatus(Status.FAILED);
        }
      })
      .catch(() => {
        setStatus(Status.FAILED);
      });
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
        description={description}
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
