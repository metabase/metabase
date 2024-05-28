import type { ReactNode } from "react";
import { t } from "ttag";

import { Icon, HoverCard, Stack, Flex, Text, Switch } from "metabase/ui";

import { SettingRequiredLabel } from "./RequiredParamToggle.styled";

interface RequiredParamToggleProps {
  disabled?: boolean;
  uniqueId: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabledTooltip: ReactNode;
}

export function RequiredParamToggle(props: RequiredParamToggleProps) {
  const { disabled, value, onChange, uniqueId, disabledTooltip } = props;
  const id = `required_param_toggle_${uniqueId}`;

  return (
    <Flex gap="sm" mt="md">
      <Switch
        disabled={disabled}
        id={id}
        checked={value}
        onChange={event => onChange(event.currentTarget.checked)}
      />
      <div>
        <SettingRequiredLabel htmlFor={id}>
          {t`Always require a value`}
          {disabled && (
            <HoverCard position="top-end" shadow="xs">
              <HoverCard.Target>
                <Icon name="info_filled" />
              </HoverCard.Target>
              <HoverCard.Dropdown w={320}>
                <Stack p="md" spacing="sm">
                  {disabledTooltip}
                </Stack>
              </HoverCard.Dropdown>
            </HoverCard>
          )}
        </SettingRequiredLabel>

        <Text
          mt="sm"
          lh={1.2}
        >{t`When enabled, people can change the value or reset it, but can't clear it entirely.`}</Text>
      </div>
    </Flex>
  );
}
