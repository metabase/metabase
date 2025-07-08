import { useField } from "formik";
import type { HTMLAttributes } from "react";
import { t } from "ttag";

import { skipToken, useGetUserQuery } from "metabase/api";
import FormField from "metabase/common/components/FormField";
import { Accordion, Box, Loader, Text } from "metabase/ui";
import type { UserId } from "metabase-types/api";

import { LoginAttributeMappingEditor } from "./LoginAttributeMappingEditor";

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
      <Accordion mt="xl">
        <Accordion.Item value="login-attributes">
          <Accordion.Control>
            <Text fz="lg">{title}</Text>
          </Accordion.Control>
          <Accordion.Panel>
            <Box pt="md">
              {isLoading ? (
                <Loader />
              ) : (
                <LoginAttributeMappingEditor
                  simpleAttributes={value}
                  structuredAttributes={userData?.structured_attributes ?? {}}
                  onChange={handleChange}
                  onError={handleError}
                />
              )}
            </Box>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </FormField>
  );
};
