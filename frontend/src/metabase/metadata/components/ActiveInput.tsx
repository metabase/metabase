import { t } from "ttag";

import { Box, SegmentedControl } from "metabase/ui";

interface Props {
  value: boolean;
  onChange: (value: boolean) => void;
  label?: string;
  className?: string;
  styles?: {
    label?: React.CSSProperties;
    input?: React.CSSProperties;
  };
}

export const ActiveInput = ({
  value,
  onChange,
  label = t`Active`,
  className,
  styles,
}: Props) => {
  return (
    <Box className={className}>
      <Box component="label" style={styles?.label}>
        {label}
      </Box>
      <Box style={styles?.input}>
        <SegmentedControl
          data={[
            { value: "true", label: t`Active` },
            { value: "false", label: t`Inactive` },
          ]}
          value={value ? "true" : "false"}
          onChange={(value) => onChange(value === "true")}
          fullWidth
          disabled
        />
      </Box>
    </Box>
  );
};
