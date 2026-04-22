import { t } from "ttag";

import type { MetabaseThemePreset } from "metabase/embedding-sdk/theme";
import { Radio, Stack } from "metabase/ui";

import { BaseAppearanceSection } from "./BaseAppearanceSection";

type Props = {
  preset: MetabaseThemePreset | undefined;
  onPresetChange: (themePreset: MetabaseThemePreset) => void;
};

export const SimpleThemeSwitcherSection = ({
  preset,
  onPresetChange,
}: Props) => {
  return (
    <BaseAppearanceSection>
      <Radio.Group
        value={preset}
        onChange={(value) => onPresetChange(value as MetabaseThemePreset)}
      >
        <Stack gap="sm">
          <Radio value="light" label={t`Light`} />
          <Radio value="dark" label={t`Dark`} />
        </Stack>
      </Radio.Group>
    </BaseAppearanceSection>
  );
};
