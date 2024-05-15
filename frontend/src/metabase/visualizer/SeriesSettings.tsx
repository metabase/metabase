import { t } from "ttag";

import { Card, Divider, Flex, Text, Select } from "metabase/ui";
import visualizations from "metabase/visualizations";
import type { Card as ICard, SingleSeries } from "metabase-types/api";

interface SeriesSettingsProps {
  series: SingleSeries;
  onChange: (card: ICard) => void;
}

export function SeriesSettings({ series, onChange }: SeriesSettingsProps) {
  const { card, data } = series;

  const vizOptions = Array.from(visualizations)
    .filter(([, viz]) => !viz.hidden)
    .map(([vizType, viz]) => ({
      label: viz.uiName,
      value: vizType,
      icon: viz.iconName,
      disabled: viz.isSensible && !viz.isSensible?.(data),
    }));

  return (
    <Card>
      <Flex direction="row" align="center" justify="space-between">
        <Text fw="bold" display="block">{t`Settings`}</Text>
      </Flex>
      <Divider mt="sm" />
      <div style={{ marginTop: "8px" }}>
        <Select
          value={card.display}
          data={vizOptions}
          onChange={display => display && onChange({ ...card, display })}
          styles={{
            dropdown: {
              maxHeight: "320px !important",
            },
          }}
        />
      </div>
    </Card>
  );
}
