import { useEffect, useState } from "react";
import { t } from "ttag";

import { SettingHeader } from "metabase/admin/settings/components/SettingHeader";
import { useAdminSetting } from "metabase/api/utils";
import type { GenericErrorResponse } from "metabase/lib/errors";
import { TextInput } from "metabase/ui";

import { getRelativeLandingPageUrl } from "./utils";

export function LandingPageWidget() {
  const [error, setError] = useState<string | null>(null);
  const { value, updateSetting, description } = useAdminSetting("landing-page");
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
      const message =
        (result.error as { data: GenericErrorResponse })?.data?.message ||
        t`Something went wrong`;
      setError(message);
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
