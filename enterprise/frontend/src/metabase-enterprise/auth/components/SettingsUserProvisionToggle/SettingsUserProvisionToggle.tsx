import { useField } from "formik";
import { Stack, Switch, Text, type StackProps } from "metabase/ui";

interface SettingsUserProvisionToggleProps extends StackProps {
  field: {
    name: string;
    label: string;
    description: string;
  };
}

export const SettingsUserProvisionToggle = ({
  field,
  ...props
}: SettingsUserProvisionToggleProps) => {
  const [{ value }, _, { setValue }] = useField(field.name);

  return (
    <Stack spacing={"0.75rem"} {...props}>
      <Text
        lh={1}
        size="0.875rem"
        weight="bold"
        color="text-medium"
        tt="uppercase"
      >
        {field.label}
      </Text>
      <Text lh={1.5} mb="0.25rem">
        {field.description}
      </Text>
      <Switch
        labelPosition="left"
        checked={value}
        onChange={e => setValue(e.target.checked)}
      />
    </Stack>
  );
};
