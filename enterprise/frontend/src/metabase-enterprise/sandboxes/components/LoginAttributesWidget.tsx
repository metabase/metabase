import { useField, useFormikContext } from "formik";
import type { HTMLAttributes } from "react";
import { t } from "ttag";

import { skipToken } from "metabase/api";
import FormField from "metabase/common/components/FormField";
import { MappingEditor } from "metabase/common/components/MappingEditor";
import { Accordion, Box, Loader } from "metabase/ui";
import { useGetTenantQuery } from "metabase-enterprise/api";

import { getDisabledTenantUserAttribute } from "../utils";

interface Props extends HTMLAttributes<HTMLDivElement> {
  name: string;
  title?: string;
  description?: string;
}

export const LoginAttributesWidget = ({
  name = "login_attributes",
  title = t`Attributes`,
  description,
  className,
  style,
}: Props) => {
  const [{ value }, , { setValue, setError }] = useField(name);

  const handleChange = (newValue: Record<string, string>) => {
    const validEntries = Object.entries(newValue).filter(
      ([key]) => !key.startsWith("@"),
    );
    setValue(Object.fromEntries(validEntries));
  };

  const handleError = (error: boolean) => {
    if (error) {
      setError(t`Duplicate login attribute keys`);
    }
  };

  const { values } = useFormikContext<{ tenant_id: number }>();

  const { data: tenant, isLoading } = useGetTenantQuery(
    values.tenant_id ?? skipToken,
  );

  return (
    <FormField className={className} style={style} description={description}>
      <Accordion>
        <Accordion.Item value="login-attributes">
          <Accordion.Control>{title}</Accordion.Control>
          <Accordion.Panel>
            <Box pt="md">
              {isLoading ? (
                <Loader />
              ) : (
                <MappingEditor
                  specialEntries={getDisabledTenantUserAttribute(tenant, value)}
                  value={removeDuplicateKeys(
                    value ?? {},
                    tenant?.attributes ?? {},
                  )}
                  onChange={handleChange}
                  onError={handleError}
                  addText={t`Add an attribute`}
                />
              )}
            </Box>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </FormField>
  );
};

const removeDuplicateKeys = (userAttributes, tenantAttributes) => {
  const tenantAttributeSet = new Set(Object.keys(tenantAttributes));

  return Object.fromEntries(
    Object.entries(userAttributes).filter(
      ([key]) => !tenantAttributeSet.has(key),
    ),
  );
};
