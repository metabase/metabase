import { useField } from "formik";

import { useUniqueId } from "metabase/common/hooks/use-unique-id";
import { FormField } from "metabase/forms";
import { Icon, Select, type SelectOption } from "metabase/ui";

export function IconField({
  name,
  title,
  options,
}: {
  name: string;
  title: string;
  options: SelectOption[];
}) {
  const id = useUniqueId();
  const [{ value, onBlur }, { error, touched }, { setValue }] = useField(name);

  return (
    <FormField title={title} htmlFor={id} error={touched ? error : undefined}>
      <Select
        id={id}
        name={name}
        value={value}
        onChange={setValue}
        onBlur={onBlur}
        data={options}
        leftSection={<Icon name={value} />}
      />
    </FormField>
  );
}
