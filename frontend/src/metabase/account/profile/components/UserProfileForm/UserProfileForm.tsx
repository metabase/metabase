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

const SsoProfileSchema = Yup.object({
  locale: Yup.string().nullable(true),
});

const LocalProfileSchema = SsoProfileSchema.shape({
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
  onSubmit: (user: User, data: UserProfileData) => void;
}

const UserProfileForm = ({
  user,
  locales,
  isSsoUser,
  onSubmit,
}: UserProfileFormProps): JSX.Element => {
  const initialValues = useMemo(() => getInitialValues(user), [user]);
  const localeOptions = useMemo(() => getLocaleOptions(locales), [locales]);

  const handleSubmit = useCallback(
    (data: UserProfileData) => onSubmit(user, getSubmitValues(data)),
    [user, onSubmit],
  );

  return (
    <FormProvider
      initialValues={initialValues}
      validationSchema={isSsoUser ? SsoProfileSchema : LocalProfileSchema}
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
                fullWidth
              />
              <FormInput
                name="last_name"
                title={t`Last name`}
                placeholder={t`Appleseed`}
                fullWidth
              />
              <FormInput
                name="email"
                type="email"
                title={t`Email`}
                placeholder="nicetoseeyou@email.com"
                fullWidth
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

const getInitialValues = (user: User): UserProfileData => {
  return {
    first_name: user.first_name || "",
    last_name: user.last_name || "",
    email: user.email,
    locale: user.locale,
  };
};

const getSubmitValues = (data: UserProfileData): UserProfileData => {
  return {
    ...data,
    first_name: data.first_name || null,
    last_name: data.last_name || null,
  };
};

const getLocaleOptions = (locales: LocaleData[] | null) => {
  const options = _.chain(locales ?? [["en", "English"]])
    .map(([value, name]) => ({ name, value }))
    .sortBy(({ name }) => name)
    .value();

  return [{ name: t`Use site default`, value: null }, ...options];
};

export default UserProfileForm;
