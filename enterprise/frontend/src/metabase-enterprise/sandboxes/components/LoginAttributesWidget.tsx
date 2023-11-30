import type { HTMLAttributes } from "react";
import { t } from "ttag";
import { useField } from "formik";

import FormField from "metabase/core/components/FormField";

import { MappingEditor } from "./MappingEditor";

interface Props extends HTMLAttributes<HTMLDivElement> {
  name: string;
  title?: string;
}

export const LoginAttributesWidget = ({
  name = "login_attributes",
  title = t`Attributes`,
  className,
  style,
}: Props) => {
  const [{ value }, , { setValue }] = useField(name);

  return (
    <FormField className={className} style={style} title={title}>
      <MappingEditor
        value={value || {}}
        onChange={setValue}
        addText={t`Add an attribute`}
      />
    </FormField>
  );
};
