import { useField, useFormikContext } from "formik";
import type { HTMLAttributes } from "react";
import { t } from "ttag";

import { skipToken } from "metabase/api";
import FormField from "metabase/common/components/FormField";
import { MappingEditor } from "metabase/common/components/MappingEditor";
import { useGetTenantQuery } from "metabase-enterprise/api";

import { getDisabledTenantUserAttribute } from "../utils";

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

  const { values } = useFormikContext<{ tenant_id: number }>();

  const { data } = useGetTenantQuery(values.tenant_id ?? skipToken);

  return (
    <FormField className={className} style={style} title={title}>
      <MappingEditor
        disabledValues={getDisabledTenantUserAttribute(data)}
        value={value || {}}
        onChange={setValue}
        onError={handleError}
        addText={t`Add an attribute`}
      />
    </FormField>
  );
};
