import { useCallback, useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";
import * as Yup from "yup";

import { ColorSchemeToggle } from "metabase/common/components/ColorSchemeToggle";
import { CommunityLocalizationNotice } from "metabase/common/components/CommunityLocalizationNotice";
import FormErrorMessage from "metabase/common/components/FormErrorMessage";
import FormInput from "metabase/common/components/FormInput";
import FormSelect from "metabase/common/components/FormSelect";
import FormSubmitButton from "metabase/common/components/FormSubmitButton";
import { Form, FormProvider } from "metabase/forms";
import * as Errors from "metabase/lib/errors";
import { Box, Flex, Text } from "metabase/ui";

import type { MetabaseUsersApiUser } from "../../../../../../../ts-types/hey-api/types.gen";
import { MetabaseSessionApiAvailableLocale } from "../../../../../../../ts-types/hey-api/types.gen";
import type { UserProfileData } from "../../types";

const SSO_PROFILE_SCHEMA = Yup.object({
  locale: Yup.string().nullable().default(null),
});

const LOCAL_PROFILE_SCHEMA = SSO_PROFILE_SCHEMA.shape({
  first_name: Yup.string().nullable().default(null).max(100, Errors.maxLength),
  last_name: Yup.string().nullable().default(null).max(100, Errors.maxLength),
  email: Yup.string().ensure().required(Errors.required).email(Errors.email),
});

export interface UserProfileFormProps {
  user: MetabaseUsersApiUser;
  isSsoUser: boolean;
  onSubmit: (user: MetabaseUsersApiUser, data: UserProfileData) => void;
}

const UserProfileForm = ({
  user,
  isSsoUser,
  onSubmit,
}: UserProfileFormProps): JSX.Element => {
  const schema = isSsoUser ? SSO_PROFILE_SCHEMA : LOCAL_PROFILE_SCHEMA;

  const initialValues = useMemo(() => {
    return schema.cast(user, { stripUnknown: true });
  }, [user, schema]);

  // const localeOptions = useMemo(() => {
  //   return getLocaleOptions(locales);
  // }, [locales]);

  const localeOptions = getLocaleOptions(
    Object.values(MetabaseSessionApiAvailableLocale).map((x) => [x[0], x[1]]),
  );

  const handleSubmit = useCallback(
    (values: UserProfileData) => onSubmit(user, values),
    [user, onSubmit],
  );

  return (
    <Box>
      <ColorSchemeSwitcher />
      <FormProvider
        initialValues={initialValues}
        validationSchema={schema}
        enableReinitialize
        onSubmit={handleSubmit}
      >
        {({ dirty }) => (
          <Form disabled={!dirty}>
            {!isSsoUser && (
              <>
                <FormInput
                  name="first_name"
                  title={t`First name`}
                  placeholder={t`Johnny`}
                  nullable
                />
                <FormInput
                  name="last_name"
                  title={t`Last name`}
                  placeholder={t`Appleseed`}
                  nullable
                />
                <FormInput
                  name="email"
                  type="email"
                  title={t`Email`}
                  placeholder="nicetoseeyou@email.com"
                />
              </>
            )}
            <div data-testid="user-locale-select">
              <FormSelect
                name="locale"
                title={t`Language`}
                options={localeOptions}
                description={
                  <CommunityLocalizationNotice isAdminView={false} />
                }
              />
              {/* {user.middle_name} */}
            </div>
            <FormSubmitButton title={t`Update`} disabled={!dirty} primary />
            <FormErrorMessage />
          </Form>
        )}
      </FormProvider>
    </Box>
  );
};

const getLocaleOptions = (locales: [string, string][] | null) => {
  const options = _.chain(locales ?? [["en", "English"]])
    .map(([value, name]) => ({ name, value }))
    .sortBy(({ name }) => name)
    .value();

  return [{ name: t`Use site default`, value: null }, ...options];
};

const ColorSchemeSwitcher = () => {
  const toggleId = "color-switcher-toggle";
  return (
    <Box mb="lg">
      {/* this font doesn't match because the old form component is at 12.3px 🙄 */}
      <Text mt="xs" fw="bold" c="text-medium">
        {t`Theme`}
      </Text>

      <Flex align="center" gap="sm" pt="sm">
        <ColorSchemeToggle id={toggleId} />
        <label style={{ cursor: "pointer" }} htmlFor={toggleId}>
          <Text>{t`Toggle between light and dark color schemes`}</Text>
        </label>
      </Flex>
    </Box>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default UserProfileForm;
