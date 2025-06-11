import { useField, useFormikContext } from "formik";
import type { HTMLAttributes } from "react";
import { t } from "ttag";

import FormField from "metabase/core/components/FormField";
import { MappingEditor } from "metabase/core/components/MappingEditor";
import { useGetTenantQuery } from "metabase-enterprise/api";
import { skipToken } from "metabase/api";

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
  const [{ value }, , { setValue, setError }] = useField(name);

  const handleError = (error: boolean) => {
    if (error) {
      setError(t`Duplicate login attribute keys`);
    }
  };

  const { values } = useFormikContext();

  const { data } = useGetTenantQuery(values.tenant_id ?? skipToken);

  return (
    <FormField className={className} style={style} title={title}>
      <MappingEditor
        disabledValues={data ? { Tenant: data.slug } : {}}
        value={value || {}}
        onChange={setValue}
        onError={handleError}
        addText={t`Add an attribute`}
      />
    </FormField>
  );
};
