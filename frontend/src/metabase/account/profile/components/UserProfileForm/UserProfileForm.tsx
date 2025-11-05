import { useCallback, useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";
import * as Yup from "yup";

import { ColorSchemeSelect } from "metabase/common/components/ColorScheme";
import { CommunityLocalizationNotice } from "metabase/common/components/CommunityLocalizationNotice";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSelect,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import * as Errors from "metabase/lib/errors";
import { Box, Text } from "metabase/ui";
import type { LocaleData, User } from "metabase-types/api";

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
  user: User;
  locales: LocaleData[] | null;
  isSsoUser: boolean;
  onSubmit: (user: User, data: UserProfileData) => void;
}

const UserProfileForm = ({
  user,
  locales,
  isSsoUser,
  onSubmit,
}: UserProfileFormProps): JSX.Element => {
  const schema = isSsoUser ? SSO_PROFILE_SCHEMA : LOCAL_PROFILE_SCHEMA;

  const initialValues = useMemo(() => {
    const values = schema.cast(user, { stripUnknown: true });

    if (values.locale === null) {
      values.locale = "";
    }
    return values;
  }, [user, schema]);

  const localeOptions = useMemo(() => {
    return getLocaleOptions(locales);
  }, [locales]);

  const handleSubmit = useCallback(
    (values: UserProfileData) =>
      onSubmit(user, {
        ...values,
        locale: values.locale === "" ? null : values.locale,
      }),
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
                <FormTextInput
                  name="first_name"
                  label={t`First name`}
                  placeholder={t`Johnny`}
                  nullable
                  mb="md"
                />
                <FormTextInput
                  name="last_name"
                  label={t`Last name`}
                  placeholder={t`Appleseed`}
                  nullable
                  mb="md"
                />
                <FormTextInput
                  name="email"
                  type="email"
                  label={t`Email`}
                  placeholder="nicetoseeyou@email.com"
                  mb="md"
                />
              </>
            )}
            <div data-testid="user-locale-select">
              <FormSelect
                name="locale"
                label={t`Language`}
                data={localeOptions}
                description={
                  <CommunityLocalizationNotice isAdminView={false} />
                }
                mb="md"
              />
            </div>
            <FormSubmitButton
              label={t`Update`}
              disabled={!dirty}
              variant="primary"
            />
            <FormErrorMessage />
          </Form>
        )}
      </FormProvider>
    </Box>
  );
};

const getLocaleOptions = (locales: LocaleData[] | null) => {
  const options = _.chain(locales ?? [["en", "English"]])
    .map(([value, label]) => ({ label, value }))
    .sortBy(({ label }) => label)
    .value();

  return [{ label: t`Use site default`, value: "" }, ...options];
};

const ColorSchemeSwitcher = () => {
  return (
    <Box mb="md">
      <Text mt="xs" fw="bold">
        {t`Theme`}
      </Text>

      <ColorSchemeSelect />
    </Box>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default UserProfileForm;
