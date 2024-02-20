import { useCallback, useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";
import * as Yup from "yup";

import FormErrorMessage from "metabase/core/components/FormErrorMessage";
import FormInput from "metabase/core/components/FormInput";
import FormSelect from "metabase/core/components/FormSelect";
import FormSubmitButton from "metabase/core/components/FormSubmitButton";
import { Form, FormProvider } from "metabase/forms";
import * as Errors from "metabase/lib/errors";
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
    return schema.cast(user, { stripUnknown: true });
  }, [user, schema]);

  const localeOptions = useMemo(() => {
    return getLocaleOptions(locales);
  }, [locales]);

  const handleSubmit = useCallback(
    (values: UserProfileData) => onSubmit(user, values),
    [user, onSubmit],
  );

  return (
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default UserProfileForm;
