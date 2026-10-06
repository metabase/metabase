import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import type { ChangeEvent } from "react";
import { useMemo } from "react";
import { t } from "ttag";

import { getInputTypes } from "metabase/actions/constants";
import { useUniqueId } from "metabase/common/hooks/use-unique-id";
import CS from "metabase/css/core/index.css";
import {
  Box,
  Divider,
  Flex,
  Icon,
  Popover,
  Radio,
  Stack,
  Switch,
  UnstyledButton,
} from "metabase/ui";
import { TextInput } from "metabase/ui/components/inputs/TextInput";
import type {
  FieldSettings,
  FieldType,
  InputSettingType,
} from "metabase-types/api";

import { getDefaultValueInputType } from "./utils";

export interface FieldSettingsPopoverProps {
  fieldSettings: FieldSettings;
  onChange: (fieldSettings: FieldSettings) => void;
}

export function FieldSettingsPopover({
  fieldSettings,
  onChange,
}: FieldSettingsPopoverProps) {
  const [isOpened, { open, close, toggle }] = useDisclosure(false);

  return (
    <Popover
      opened={isOpened}
      onChange={(nextOpened) => (nextOpened ? open() : close())}
      position="bottom-end"
      trapFocus
    >
      <Popover.Target>
        <UnstyledButton onClick={toggle}>
          <Icon
            className={cx(CS.textPrimary, CS.textBrandHover)}
            name="gear"
            size={16}
            tooltip={t`Change field settings`}
            aria-label={t`Field settings`}
          />
        </UnstyledButton>
      </Popover.Target>
      <Popover.Dropdown maw={400}>
        <FormCreatorPopoverBody
          fieldSettings={fieldSettings}
          onChange={onChange}
        />
      </Popover.Dropdown>
    </Popover>
  );
}

export function FormCreatorPopoverBody({
  fieldSettings,
  onChange,
}: {
  fieldSettings: FieldSettings;
  onChange: (fieldSettings: FieldSettings) => void;
}) {
  const handleUpdateInputType = (newInputType: InputSettingType) =>
    onChange({
      ...fieldSettings,
      inputType: newInputType,
    });

  const handleUpdatePlaceholder = (newPlaceholder: string) =>
    onChange({
      ...fieldSettings,
      placeholder: newPlaceholder,
    });

  const handleUpdateRequired = (required: boolean) =>
    onChange({
      ...fieldSettings,
      required,
      defaultValue: undefined,
    });

  const handleUpdateDefaultValue = (
    defaultValue: string | number | undefined,
  ) =>
    onChange({
      ...fieldSettings,
      defaultValue,
    });

  const hasPlaceholder =
    fieldSettings.fieldType !== "date" && fieldSettings.inputType !== "radio";

  return (
    <Stack p="xxl" gap="lg" data-testid="field-settings-popover">
      <InputTypeSelect
        value={fieldSettings.inputType}
        fieldType={fieldSettings.fieldType}
        onChange={handleUpdateInputType}
      />
      <Divider data-testid="divider" />
      {hasPlaceholder && (
        <>
          <PlaceholderInput
            value={fieldSettings.placeholder ?? ""}
            onChange={handleUpdatePlaceholder}
          />
          <Divider data-testid="divider" />
        </>
      )}
      <RequiredInput
        fieldSettings={fieldSettings}
        onChangeRequired={handleUpdateRequired}
        onChangeDefaultValue={handleUpdateDefaultValue}
      />
    </Stack>
  );
}

function InputTypeSelect({
  fieldType,
  value,
  onChange,
}: {
  value: InputSettingType;
  fieldType: FieldType;
  onChange: (newInputType: InputSettingType) => void;
}) {
  const inputTypes = useMemo(getInputTypes, []);
  const options = inputTypes[fieldType ?? "string"];

  return (
    <Radio.Group
      value={value}
      // Mantine's radio uses broad `string` type for value even though we supply specifically InputSettingType
      onChange={(newInputType) => onChange(newInputType as InputSettingType)}
    >
      <Stack gap="sm">
        {options.map((option) => (
          <Radio key={option.value} value={option.value} label={option.name} />
        ))}
      </Stack>
    </Radio.Group>
  );
}

function PlaceholderInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (newPlaceholder: string) => void;
}) {
  const id = useUniqueId();

  return (
    <TextInput
      id={id}
      w="100%"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      data-testid="placeholder-input"
      label={t`Placeholder text`}
    />
  );
}

interface RequiredInputProps {
  fieldSettings: FieldSettings;
  onChangeRequired: (required: boolean) => void;
  onChangeDefaultValue: (defaultValue: string | number | undefined) => void;
}

function RequiredInput({
  fieldSettings: { fieldType, inputType, required, defaultValue },
  onChangeRequired,
  onChangeDefaultValue,
}: RequiredInputProps) {
  const id = useUniqueId();

  const handleDefaultValueChange = ({
    target: { value },
  }: ChangeEvent<HTMLInputElement>) => {
    if (!value) {
      onChangeDefaultValue(undefined);
    } else if (fieldType === "number") {
      onChangeDefaultValue(Number(value));
    } else {
      onChangeDefaultValue(value);
    }
  };

  return (
    <div>
      <Flex align="center" justify="space-between" mb="sm">
        <Box component="label" fw="bold" htmlFor={`${id}-required`}>
          {t`Required`}
        </Box>
        <Switch
          id={`${id}-required`}
          checked={required}
          onChange={(e) => onChangeRequired(e.currentTarget.checked)}
        />
      </Flex>
      {required && (
        <>
          <TextInput
            id={`${id}-default`}
            label={t`Default value`}
            data-testid="default-value-input"
            type={getDefaultValueInputType(inputType)}
            w="100%"
            value={defaultValue ?? ""}
            onChange={handleDefaultValueChange}
          />
        </>
      )}
    </div>
  );
}
