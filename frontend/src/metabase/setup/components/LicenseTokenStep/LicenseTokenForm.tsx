import { t } from "ttag";
import * as Yup from "yup";

import FormSubmitButton from "metabase/core/components/FormSubmitButton";
import {
  FormProvider,
  Form,
  FormTextInput,
  FormErrorMessage,
} from "metabase/forms";
import * as Errors from "metabase/lib/errors";
import { Box, Button, Flex } from "metabase/ui";

type LicenseTokenFormProps = {
  onSubmit: (token: string) => Promise<void>;
  onSkip: () => void;
  initialValue?: string;
};

const LICENSE_TOKEN_SCHEMA = Yup.object({
  license_token: Yup.string()
    .length(64, Errors.exactLength)
    .required(Errors.required),
});

export const LicenseTokenForm = ({
  onSubmit,
  onSkip,
  initialValue = "",
}: LicenseTokenFormProps) => {
  return (
    <FormProvider
      initialValues={{ license_token: initialValue }}
      validationSchema={LICENSE_TOKEN_SCHEMA}
      onSubmit={values => onSubmit(values.license_token)}
    >
      {({ errors, setValues }) => (
        <Form>
          <Box mb="md">
            <FormTextInput
              aria-label={t`Token`}
              placeholder={t`Paste your token here`}
              name="license_token"
              onChange={e => {
                const val = e.target.value;
                const trimmed = val.trim();
                if (val !== trimmed) {
                  setValues({ license_token: trimmed });
                }
              }}
            />
            <FormErrorMessage />
          </Box>
          <Flex gap="sm">
            <Button onClick={onSkip}>{t`Skip`}</Button>
            <FormSubmitButton
              title={t`Activate`}
              activeTitle={t`Activating`}
              disabled={!!errors.license_token}
            />
          </Flex>
        </Form>
      )}
    </FormProvider>
  );
};
