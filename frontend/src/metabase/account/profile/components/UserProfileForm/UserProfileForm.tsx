import { useCallback, useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";
import * as Yup from "yup";

import { ColorSchemeSelect } from "metabase/common/components/ColorScheme";
import { CommunityLocalizationNotice } from "metabase/common/components/CommunityLocalizationNotice";
import { useUserSetting } from "metabase/common/hooks";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSelect,
  FormSubmitButton,
  FormTextInput,
  FormTextarea,
} from "metabase/forms";
import { useUserMetabotPermissions } from "metabase/metabot/hooks/use-user-metabot-permissions";
import { Box, Text } from "metabase/ui";
import * as Errors from "metabase/utils/errors";
import type { LocaleData, User } from "metabase-types/api";

import type { UserProfileData } from "../../types";

// Must match `max-user-custom-instructions-length` in metabot/settings.clj.
const MAX_CUSTOM_INSTRUCTIONS_LENGTH = 2000;

const SSO_PROFILE_SCHEMA = Yup.object({
  locale: Yup.string().nullable().default(null),
  "metabot-user-custom-instructions": Yup.string()
    .nullable()
    .default(null)
    .max(MAX_CUSTOM_INSTRUCTIONS_LENGTH, Errors.maxLength),
});

const LOCAL_PROFILE_SCHEMA = SSO_PROFILE_SCHEMA.shape({
  first_name: Yup.string().nullable().default(null).max(100, Errors.maxLength),
  last_name: Yup.string().nullable().default(null).max(100, Errors.maxLength),
  email: Yup.string().ensure().required(Errors.required).email(Errors.email),
});

type ProfileFormValues = UserProfileData & {
  "metabot-user-custom-instructions"?: string | null;
};

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
  const { hasMetabotAccess } = useUserMetabotPermissions();
  const [savedInstructions, setSavedInstructions] = useUserSetting(
    "metabot-user-custom-instructions",
    { shouldDebounce: false },
  );

  const initialValues = useMemo(() => {
    const values = schema.cast(user, { stripUnknown: true });

    if (values.locale === null) {
      values.locale = "";
    }
    return {
      ...values,
      "metabot-user-custom-instructions": savedInstructions ?? null,
    };
  }, [user, schema, savedInstructions]);

  const localeOptions = useMemo(() => {
    return getLocaleOptions(locales);
  }, [locales]);

  const handleSubmit = useCallback(
    (values: ProfileFormValues) => {
      const {
        "metabot-user-custom-instructions": instructions,
        ...profileData
      } = values;
      const newInstructions = instructions ?? null;

      if (newInstructions !== (savedInstructions ?? null)) {
        setSavedInstructions(newInstructions);
      }

      return onSubmit(user, {
        ...profileData,
        locale: profileData.locale === "" ? null : profileData.locale,
      });
    },
    [user, onSubmit, savedInstructions, setSavedInstructions],
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
                searchable
                description={
                  <CommunityLocalizationNotice isAdminView={false} />
                }
                mb="md"
              />
            </div>
            {hasMetabotAccess && (
              <FormTextarea
                name="metabot-user-custom-instructions"
                label={t`Metabot instructions`}
                description={t`Tell Metabot what you're usually working on, so it can tailor its answers to you.`}
                placeholder={t`E.g. I usually ask about sales and marketing data, not engineering metrics.`}
                nullable
                minRows={3}
                maxLength={MAX_CUSTOM_INSTRUCTIONS_LENGTH}
                mb="md"
              />
            )}
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
