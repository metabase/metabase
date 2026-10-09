import { t } from "ttag";

import {
  Button,
  Group,
  Select,
  type SelectProps,
  Stack,
  Text,
} from "metabase/ui";
import {
  FIELD_DATA_SENSITIVITY_TYPES,
  type FieldDataSensitivity,
  type FieldDataSensitivitySource,
} from "metabase-types/api";

const NO_LABEL_VALUE = "__no_label__";

interface Props extends Omit<
  SelectProps,
  "data" | "value" | "onChange" | "placeholder"
> {
  value: FieldDataSensitivity | null;
  source: FieldDataSensitivitySource | null;
  /** When false, "No label" is not offered. */
  canClear?: boolean;
  onChange: (value: FieldDataSensitivity | null) => void;
  onReset: () => void;
}

export const DataSensitivityPicker = ({
  comboboxProps,
  value,
  source,
  canClear = true,
  onChange,
  onReset,
  ...props
}: Props) => {
  const isUserSet = source === "human";

  const handleChange = (newValue: string | null) => {
    if (newValue === NO_LABEL_VALUE || newValue == null) {
      onChange(null);
    } else if (isFieldDataSensitivity(newValue)) {
      onChange(newValue);
    }
  };

  return (
    <Stack gap="xs">
      <Select
        comboboxProps={{
          withinPortal: true,
          keepMounted: false,
          middlewares: {
            flip: true,
            size: {
              padding: 6,
            },
          },
          position: "bottom-start",
          ...comboboxProps,
        }}
        data={getData(canClear)}
        placeholder={t`Not labeled`}
        value={value ?? (isUserSet ? NO_LABEL_VALUE : null)}
        onChange={handleChange}
        {...props}
      />

      {source != null && (
        <Group gap="sm" justify="space-between" wrap="nowrap">
          <Text c="text-secondary" size="sm">
            {getSourceLabel(source)}
          </Text>
          {isUserSet && (
            <Button size="compact-sm" variant="subtle" onClick={onReset}>
              {t`Reset to automatic`}
            </Button>
          )}
        </Group>
      )}
    </Stack>
  );
};

export function getDataSensitivityLabel(type: FieldDataSensitivity): string {
  const labels: Record<FieldDataSensitivity, string> = {
    SEC_KEY: t`Security credentials and secrets`,
    SYS_TELEMETRY: t`Infrastructure and system secrets`,
    PHI: t`Protected health information`,
    BIO_GEN: t`Biometric and genetic data`,
    PCI_FIN: t`Financial and payment card data`,
    SENS_PERS: t`Special category personal traits`,
    PII: t`Personally identifiable information`,
    CORP_IP: t`Intellectual property and code`,
    BIZ_CONF: t`Confidential business data`,
    PUBLIC: t`Public (not sensitive)`,
  };

  return labels[type];
}

function getSourceLabel(source: FieldDataSensitivitySource): string {
  const labels: Record<FieldDataSensitivitySource, string> = {
    human: t`Set by a person`,
    ai: t`Set by AI`,
    deterministic: t`Set by the automatic classifier`,
  };

  return labels[source];
}

function getData(canClear: boolean) {
  return [
    ...FIELD_DATA_SENSITIVITY_TYPES.map((type) => ({
      label: getDataSensitivityLabel(type),
      value: type,
    })),
    ...(canClear ? [{ label: t`No label`, value: NO_LABEL_VALUE }] : []),
  ];
}

function isFieldDataSensitivity(value: string): value is FieldDataSensitivity {
  return FIELD_DATA_SENSITIVITY_TYPES.some((type) => type === value);
}
