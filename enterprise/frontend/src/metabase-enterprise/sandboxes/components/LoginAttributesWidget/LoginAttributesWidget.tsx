import { useField } from "formik";
import { type HTMLAttributes, useMemo } from "react";
import { t } from "ttag";

import { skipToken, useGetUserQuery } from "metabase/api";
import FormField from "metabase/common/components/FormField";
import { Accordion, Box, Loader, Text } from "metabase/ui";
import { getExtraAttributes } from "metabase-enterprise/sandboxes/utils";
import type {
  StructuredUserAttributes,
  UserAttributeKey,
  UserAttributeMap,
  UserAttributeValue,
  UserId,
} from "metabase-types/api";

import { LoginAttributeMappingEditor } from "./LoginAttributeMappingEditor";

interface Props extends HTMLAttributes<HTMLDivElement> {
  name: string;
  title?: string;
  description?: string;
  userId?: UserId;
}

const isInheritedValue = (
  [key, inputValue]: [UserAttributeKey, UserAttributeValue],
  structuredAttributes: StructuredUserAttributes,
) => {
  const attribute = structuredAttributes[key];
  if (!attribute) {
    return false;
  }

  const inheritedValue =
    attribute?.original?.value ??
    (attribute.source === "jwt" ? attribute.value : undefined);
  return inheritedValue === inputValue;
};

export const LoginAttributesWidget = ({
  name = "login_attributes",
  title = t`Attributes`,
  description,
  className,
  style,
  userId,
}: Props) => {
  const [{ value }, , { setValue, setError }] = useField(name);

  const { data: userData, isLoading } = useGetUserQuery(userId ?? skipToken);

  const structuredAttributes = useMemo(() => {
    return getExtraAttributes(userData?.structured_attributes);
  }, [userData?.structured_attributes]);

  const handleChange = (newValue: UserAttributeMap) => {
    const validEntries = Object.entries(newValue).filter(
      ([key, value]) =>
        !key.startsWith("@") &&
        !isInheritedValue([key, value], structuredAttributes ?? {}),
    );
    setValue(Object.fromEntries(validEntries));
  };

  const handleError = (error: boolean) => {
    if (error) {
      setError(t`Duplicate login attribute keys`);
    }
  };

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
                  structuredAttributes={structuredAttributes}
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
