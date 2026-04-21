import { t } from "ttag";

import { LabelWithInfo } from "metabase/common/components/LabelWithInfo";
import { Flex, Switch, Text } from "metabase/ui";

interface RequiredParamToggleProps {
  disabled?: boolean;
  uniqueId: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabledTooltip: React.ReactNode;
  parametersAreUserVisible?: boolean;
}

export function RequiredParamToggle(props: RequiredParamToggleProps) {
  const {
    disabled,
    value,
    onChange,
    uniqueId,
    disabledTooltip,
    parametersAreUserVisible = true,
  } = props;
  const id = `required_param_toggle_${uniqueId}`;

  return (
    <Flex gap="sm" mt="md">
      <Switch
        disabled={disabled}
        id={id}
        checked={value}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
      <div>
        <LabelWithInfo
          label={t`Always require a value`}
          info={disabled ? disabledTooltip : undefined}
          htmlFor={id}
        />

        {parametersAreUserVisible && (
          <Text
            mt="sm"
            lh={1.2}
          >{t`When enabled, people can change the value or reset it, but can't clear it entirely.`}</Text>
        )}
      </div>
    </Flex>
  );
}
