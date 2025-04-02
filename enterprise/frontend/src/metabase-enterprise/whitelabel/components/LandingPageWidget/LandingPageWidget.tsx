import { useEffect, useState } from "react";
import { t } from "ttag";

import { SettingHeader } from "metabase/admin/settings/components/SettingHeader";
import type { GenericErrorResponse } from "metabase/lib/errors";
import { TextInput } from "metabase/ui";
import { useEnterpriseAdminSetting } from "metabase-enterprise/api/utils/settings";

import { getRelativeLandingPageUrl } from "./utils";

export function LandingPageWidget() {
  const [error, setError] = useState<string | null>(null);
  const { value, updateSetting, description } =
    useEnterpriseAdminSetting("landing-page");
  const [inputValue, setInputValue] = useState(value ?? "");

  useEffect(() => {
    if (value) {
      setInputValue(value);
    }
  }, [value]);

  const handleChange = async (value: string) => {
    const { isSameOrigin, relativeUrl } = getRelativeLandingPageUrl(
      value.trim(),
    );

    if (!isSameOrigin) {
      setError(t`This field must be a relative URL.`);
      return;
    }

    setError(null);
    const result = await updateSetting({
      key: "landing-page",
      value: relativeUrl,
    });

    if (result.error) {
      setError(
        (result as GenericErrorResponse)?.message || t`Something went wrong`,
      );
    }
  };

  return (
    <div>
      <SettingHeader
        id="landing-page"
        title={t`Landing Page`}
        description={description}
      />
      <TextInput
        id="landing-page"
        data-testid="landing-page"
        aria-label={t`Landing page custom destination`}
        placeholder="/"
        error={error}
        value={String(inputValue ?? "")}
        onChange={(e) => {
          setError(null);
          setInputValue(e.target.value);
        }}
        onBlur={(e) => handleChange(e.target.value)}
      />
    </div>
  );
}
