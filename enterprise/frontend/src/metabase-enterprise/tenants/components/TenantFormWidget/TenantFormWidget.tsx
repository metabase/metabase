import { useField } from "formik";
import { t } from "ttag";

import { Select, type SelectProps } from "metabase/ui";
import { useListTenantsQuery } from "metabase-enterprise/api";
import type { Tenant } from "metabase-types/api";

interface FormTenantWidget extends Partial<SelectProps> {
  name: string;
}

export const FormTenantWidget = ({ name, ...props }: FormTenantWidget) => {
  const [{ value: formValue }, , { setValue }] = useField<Tenant["id"] | null>(
    name,
  );

  const { data: tenants, isLoading } = useListTenantsQuery({
    status: "active",
  });

  if (isLoading || !tenants) {
    return null;
  }

  const options = tenants.data.map((tenant) => ({
    label: tenant.name,
    value: tenant.id.toString(),
  }));

  return (
    <Select
      value={formValue?.toString()}
      onChange={(val) => setValue(parseInt(val))}
      data={options}
      label={t`Tenant`}
      mb="1rem"
      {...props}
    ></Select>
  );
};
