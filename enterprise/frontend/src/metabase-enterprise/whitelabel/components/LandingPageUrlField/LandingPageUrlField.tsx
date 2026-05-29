import { useEffect, useState } from "react";
import { t } from "ttag";

import { useAdminSetting } from "metabase/api/utils";
import { Stack, Text, TextInput } from "metabase/ui";
import type { GenericErrorResponse } from "metabase/utils/errors";

import { getRelativeLandingPageUrl } from "./utils";

export function LandingPageUrlField() {
  const [error, setError] = useState<string | null>(null);
  const { value, updateSetting } = useAdminSetting("landing-page");
  const [inputValue, setInputValue] = useState(value ?? "");

  useEffect(() => {
    if (value) {
      setInputValue(value);
    }
  }, [value]);

  const handleBlur = async (raw: string) => {
    const { isSameOrigin, relativeUrl } = getRelativeLandingPageUrl(raw.trim());

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
    <Stack gap="xs">
      <TextInput
        id="landing-page"
        data-testid="landing-page"
        aria-label={t`Landing page custom destination`}
        aria-describedby="landing-page-hint"
        placeholder="/dashboard/1"
        error={error}
        value={inputValue}
        onChange={(e) => {
          setError(null);
          setInputValue(e.target.value);
        }}
        onBlur={(e) => handleBlur(e.target.value)}
      />
      <Text id="landing-page-hint" size="xs" c="text-secondary">
        {t`Enter a relative URL like /dashboard/1 or /collection/2.`}
      </Text>
    </Stack>
  );
}
