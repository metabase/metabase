import { useCallback, useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";
import * as Yup from "yup";

import { ColorSchemeSelect } from "metabase/common/components/ColorScheme";
import { CommunityLocalizationNotice } from "metabase/common/components/CommunityLocalizationNotice";
import { useUserKeyValue } from "metabase/common/hooks/use-user-key-value";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSelect,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import { Box, Select, Text } from "metabase/ui";
import { type CalendarId, DEFAULT_CALENDAR } from "metabase/utils/calendar";
import * as Errors from "metabase/utils/errors";
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
      <CalendarSwitcher />
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
                  mb="lg"
                />
                <FormTextInput
                  name="last_name"
                  label={t`Last name`}
                  placeholder={t`Appleseed`}
                  nullable
                  mb="lg"
                />
                <FormTextInput
                  name="email"
                  type="email"
                  label={t`Email`}
                  placeholder="nicetoseeyou@email.com"
                  mb="lg"
                />
              </>
            )}
            <div data-testid="user-locale-select">
              <FormSelect
                name="locale"
                label={t`Language`}
                data={localeOptions}
                searchable
                description={
                  <CommunityLocalizationNotice isAdminView={false} />
                }
                mb="lg"
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
    <Box mb="lg">
      <Text mt="xxs" fw="bold">
        {t`Theme`}
      </Text>

      <ColorSchemeSelect />
    </Box>
  );
};

const CalendarSwitcher = () => {
  const { value, setValue, isMutating } = useUserKeyValue({
    namespace: "calendar",
    key: "display_calendar",
    defaultValue: DEFAULT_CALENDAR,
  });

  const handleChange = (calendar: CalendarId | null) => {
    if (calendar) {
      void setValue(calendar);
    }
  };

  return (
    <Box mb="md" data-testid="user-calendar-select">
      <Select<CalendarId>
        label={t`Calendar`}
        description={t`Choose how dates are displayed. This does not change stored dates or query results.`}
        data={[
          { value: "gregory", label: t`Gregorian` },
          { value: "persian", label: t`Persian (Jalali)` },
        ]}
        value={value}
        disabled={isMutating}
        onChange={handleChange}
      />
    </Box>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default UserProfileForm;
