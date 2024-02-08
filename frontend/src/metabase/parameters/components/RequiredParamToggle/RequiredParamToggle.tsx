import { t } from "ttag";
import type { ReactNode } from "react";
import { Icon, HoverCard, Stack, Flex, Text } from "metabase/ui";
import Toggle from "metabase/core/components/Toggle";
import { SettingRequiredLabel } from "./RequierParamToggle.styled";

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
      <Toggle disabled={disabled} id={id} value={value} onChange={onChange} />
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
