import { match } from "ts-pattern";
import { t } from "ttag";

import { ActionIcon, Group, Icon, Stack, Text, Tooltip } from "metabase/ui";
import type { TableVisibilityType2 } from "metabase-types/api";

interface Props {
  value: TableVisibilityType2;
  onChange: (value: TableVisibilityType2) => void;
}

export const VisibilityInput = ({ value, onChange }: Props) => {
  const rating = getRatingValue(value);

  return (
    <Stack gap="sm">
      <Text
        component="label"
        flex="0 0 auto"
        fw="bold"
        size="md"
      >{t`Visibility`}</Text>

      <Group gap="xs">
        <Tooltip label={t`Copper`}>
          <ActionIcon
            aria-label={t`Copper`}
            opacity={rating >= 0 ? 1 : 0.5}
            onClick={() => onChange("copper")}
          >
            <Icon c="#B87333" name="recents" size={24} />
          </ActionIcon>
        </Tooltip>

        <Tooltip label={t`Bronze`}>
          <ActionIcon
            aria-label={t`Bronze`}
            opacity={rating >= 1 ? 1 : 0.5}
            onClick={() => onChange("bronze")}
          >
            <Icon c="#CD7F32" name="recents" size={24} />
          </ActionIcon>
        </Tooltip>

        <Tooltip label={t`Silver`}>
          <ActionIcon
            aria-label={t`Silver`}
            opacity={rating >= 2 ? 1 : 0.5}
            onClick={() => onChange("silver")}
          >
            <Icon c="#C0C0C0" name="recents" size={24} />
          </ActionIcon>
        </Tooltip>

        <Tooltip label={t`Gold`}>
          <ActionIcon
            aria-label={t`Gold`}
            opacity={rating >= 3 ? 1 : 0.5}
            onClick={() => onChange("gold")}
          >
            <Icon c="#FFD700" name="recents" size={24} />
          </ActionIcon>
        </Tooltip>
      </Group>
    </Stack>
  );
};

function getRatingValue(visibility: TableVisibilityType2): number {
  return match(visibility)
    .with("copper", () => 0)
    .with("bronze", () => 1)
    .with("silver", () => 2)
    .with("gold", () => 3)
    .exhaustive();
}
