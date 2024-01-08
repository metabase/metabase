import { useState } from "react";
import { t } from "ttag";
import type { EnterpriseSettings } from "metabase-enterprise/settings/types";
import { Text } from "metabase/ui";
import { isMetabaseUrl } from "metabase/lib/dom";
import { SettingInputBlurChange } from "./LandingPageWidget.styled";

interface Props {
  settingValues: EnterpriseSettings;
  onChange: (value: string) => void;
  onChangeSetting: (
    key: "landing-page",
    value: EnterpriseSettings["landing-page"],
  ) => Promise<void>;
}

export function LandingPageWidget({ onChangeSetting, settingValues }: Props) {
  const [error, setError] = useState<string | null>(null);

  const normalize = (value: string | number | null) => {
    if (typeof value !== "string") {
      return value;
    }
    const normalizedValue = value.trim();
    return normalizedValue === "" ? null : normalizedValue;
  };

  const handleChange = async (rawValue: string) => {
    const value = rawValue.trim();

    if (!isMetabaseUrl(value)) {
      setError(t`This field must be a relative URL.`);
    } else {
      setError(null);
      try {
        // Extract relative url info w/o protocol & host if url contains same origin
        const url = new URL(value, window.location.origin);
        const relativeUrl = url.pathname + url.search + url.hash;
        await onChangeSetting("landing-page", relativeUrl);
      } catch (e: any) {
        setError(e?.data?.message || t`Something went wrong`);
      }
    }
  };

  return (
    <div>
      {error && (
        <Text size="md" color="error.0" data-testid="landing-page-error">
          {error}
        </Text>
      )}
      <SettingInputBlurChange
        size="large"
        error={Boolean(error)}
        style={{ marginTop: 4 }}
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
