import { t } from "ttag";
import * as MetabaseAnalytics from "metabase/lib/analytics";
import { Stack, Switch, Text } from "metabase/ui";

interface EmbeddingSwitchWidgetProps {
  onChange: (value: boolean) => void;
}

export const EmbeddingSwitchWidget = ({
  onChange,
}: EmbeddingSwitchWidgetProps) => (
  <Stack spacing={"md"} className="text-measure">
    <Text lh={1.5}>
      {t`Embed dashboards, questions, or the entire Metabase app into your application. Integrate with your server code to create a secure environment, limited to specific users or organizations.`}
    </Text>
    <Switch
      labelPosition="left"
      label={<strong>{t`Embedding Enabled`}</strong>}
      onChange={e => {
        onChange(e.currentTarget.checked);
        MetabaseAnalytics.trackStructEvent(
          "Admin Embed Settings",
          "Embedding Enable Click",
        );
      }}
    />
  </Stack>
);
