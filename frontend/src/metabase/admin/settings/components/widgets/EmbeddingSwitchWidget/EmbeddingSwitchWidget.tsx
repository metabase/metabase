import { t } from "ttag";
import * as MetabaseAnalytics from "metabase/lib/analytics";
import { Stack, Switch, Text } from "metabase/ui";

interface EmbeddingSwitchWidgetProps {
  setting: { value: boolean | null };
  onChange: (value: boolean) => void;
}

export const EmbeddingSwitchWidget = ({
  setting,
  onChange,
}: EmbeddingSwitchWidgetProps) => (
  <Stack spacing={"md"} className="text-measure">
    <Text lh={1.5}>
      {t`Embed dashboards, questions, or the entire Metabase app into your application. Integrate with your server code to create a secure environment, limited to specific users or organizations.`}
    </Text>
    <Switch
      labelPosition="left"
      checked={Boolean(setting.value)}
      label={<strong>{t`Embedding Enabled`}</strong>}
      onChange={e => {
        const newValue = e.currentTarget.checked;
        onChange(newValue);
        if (newValue) {
          MetabaseAnalytics.trackStructEvent(
            "Admin Embed Settings",
            "Embedding Enable Click",
          );
        }
      }}
    />
  </Stack>
);
