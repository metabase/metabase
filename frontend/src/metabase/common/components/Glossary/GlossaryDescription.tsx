import { t } from "ttag";

import { useSetting } from "metabase/settings";
import { Text, type TextProps } from "metabase/ui";

export function GlossaryDescription(props: TextProps) {
  const metabotName = useSetting("metabot-name");

  return (
    <Text {...props}>
      {t`Define terms to help your team and ${metabotName} understand your data.`}
    </Text>
  );
}
