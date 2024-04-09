import { useState } from "react";
import { t } from "ttag";

import { Text } from "metabase/ui";
import type { EnterpriseSettings } from "metabase-enterprise/settings/types";

import { SettingInputBlurChange } from "./LandingPageWidget.styled";
import { getRelativeLandingPageUrl } from "./utils";

interface Props {
  settingValues: EnterpriseSettings;
  onChange: (value: EnterpriseSettings["landing-page"]) => Promise<void>;
}

export function LandingPageWidget({ onChange, settingValues }: Props) {
  const [error, setError] = useState<string | null>(null);

  const normalize = (value: string | number | null) => {
    if (typeof value !== "string") {
      return value;
    }
    return value.trim() || null;
  };

  const handleChange = async (value: string) => {
    const { isSameOrigin, relativeUrl } = getRelativeLandingPageUrl(value);

    if (!isSameOrigin) {
      setError(t`This field must be a relative URL.`);
    } else {
      setError(null);
      try {
        await onChange(relativeUrl);
      } catch (e: any) {
        setError(e?.data?.message || t`Something went wrong`);
      }
    }
  };

  return (
    <div>
      {error && (
        <Text size="md" color="error" data-testid="landing-page-error">
          {error}
        </Text>
      )}
      <SettingInputBlurChange
        size="large"
        error={Boolean(error)}
        normalize={normalize}
        value={settingValues["landing-page"]}
        onChange={() => setError(null)}
        aria-label={t`Landing page custom destination`}
        data-testid="landing-page"
        placeholder="/"
        onBlurChange={e => handleChange(e.target.value)}
      />
    </div>
  );
}
