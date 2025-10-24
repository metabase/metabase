import { t } from "ttag";

import { Group, Icon, SegmentedControl, Stack, Text } from "metabase/ui";
import type { TableVisibilityType2 } from "metabase-types/api";

interface Props {
  value: TableVisibilityType2 | undefined;
  onChange: (value: TableVisibilityType2) => void;
}

export const VisibilityInput = ({ value, onChange }: Props) => {
  return (
    <Stack gap="sm">
      <Text
        component="label"
        flex="0 0 auto"
        fw="bold"
        size="md"
      >{t`Visibility`}</Text>

      <SegmentedControl<TableVisibilityType2 | "null">
        data={[
          {
            value: "copper",
            label: (
              <Group align="center" gap="sm" justify="center">
                <Icon c="#B87333" name="recents" />
                <span>{t`Copper`}</span>
              </Group>
            ),
          },
          {
            value: "bronze",
            label: (
              <Group align="center" gap="sm" justify="center">
                <Icon c="#CD7F32" name="recents" />
                <span>{t`Bronze`}</span>
              </Group>
            ),
          },
          {
            value: "silver",
            label: (
              <Group align="center" gap="sm" justify="center">
                <Icon c="#C0C0C0" name="recents" />
                <span>{t`Silver`}</span>
              </Group>
            ),
          },
          {
            value: "gold",
            label: (
              <Group align="center" gap="sm" justify="center">
                <Icon c="#FFD700" name="recents" />
                <span>{t`Gold`}</span>
              </Group>
            ),
          },
        ]}
        value={value ?? "null"}
        onChange={(value) => {
          // sanity check
          if (value !== "null") {
            onChange(value);
          }
        }}
      />
    </Stack>
  );
};
