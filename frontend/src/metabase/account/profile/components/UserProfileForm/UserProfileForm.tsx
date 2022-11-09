import React, { useCallback, useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";
import _ from "underscore";
import Form from "metabase/core/components/Form";
import FormProvider from "metabase/core/components/FormProvider";
import FormInput from "metabase/core/components/FormInput";
import FormSelect from "metabase/core/components/FormSelect";
import FormSubmitButton from "metabase/core/components/FormSubmitButton";
import FormErrorMessage from "metabase/core/components/FormErrorMessage";
import { LocaleData, User } from "metabase-types/api";
import { UserProfileData } from "../../types";

const ssoProfileSchema = Yup.object({
  locale: Yup.string().nullable(true),
});

const localProfileSchema = ssoProfileSchema.shape({
  first_name: Yup.string().max(
    100,
    ({ max }) => t`must be ${max} characters or less`,
  ),
  last_name: Yup.string().max(
    100,
    ({ max }) => t`must be ${max} characters or less`,
  ),
  email: Yup.string()
    .required(t`required`)
    .email(t`must be a valid email address`),
});

export interface UserProfileFormProps {
  user: User;
  locales: LocaleData[] | null;
  isSsoUser: boolean;
  onSubmit: (user: User, values: UserProfileData) => void;
}

const UserProfileForm = ({
  user,
  locales,
  isSsoUser,
  onSubmit,
}: UserProfileFormProps): JSX.Element => {
  const localeOptions = useMemo(() => getLocaleOptions(locales), [locales]);

  const handleSubmit = useCallback(
    (values: UserProfileData) => onSubmit(user, values),
    [user, onSubmit],
  );

  return (
    <FormProvider
      initialValues={user}
      validationSchema={isSsoUser ? ssoProfileSchema : localProfileSchema}
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
              />
              <FormInput
                name="last_name"
                title={t`Last name`}
                placeholder={t`Appleseed`}
              />
              <FormInput
                name="email"
                type="email"
                title={t`Email`}
                placeholder="nicetoseeyou@email.com"
              />
            </>
          )}
          <FormSelect
            name="locale"
            title={t`Language`}
            options={localeOptions}
          />
          <FormSubmitButton title={t`Update`} disabled={!dirty} primary />
          <FormErrorMessage />
        </Form>
      )}
    </FormProvider>
  );
};

const getLocaleOptions = (locales: LocaleData[] | null) => {
  const options = _.chain(locales ?? [["en", "English"]])
    .map(([value, name]) => ({ name, value }))
    .sortBy(({ name }) => name)
    .value();

  return [{ name: t`Use site default`, value: null }, ...options];
};

export default UserProfileForm;
