import { useField } from "formik";
import type { HTMLAttributes } from "react";
import { t } from "ttag";

import { skipToken, useGetUserQuery } from "metabase/api";
import FormField from "metabase/common/components/FormField";
import { MappingEditor } from "metabase/common/components/MappingEditor";
import { Accordion, Box, Loader } from "metabase/ui";
import type { UserId } from "metabase-types/api";

import { getSpecialEntries } from "../utils";

interface Props extends HTMLAttributes<HTMLDivElement> {
  name: string;
  title?: string;
  description?: string;
  userId?: UserId;
}

export const LoginAttributesWidget = ({
  name = "login_attributes",
  title = t`Attributes`,
  description,
  className,
  style,
  userId,
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

  const { data: userData, isLoading } = useGetUserQuery(userId ?? skipToken);
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
                  specialEntries={getSpecialEntries(userData)}
                  value={userId ? {} : value}
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
