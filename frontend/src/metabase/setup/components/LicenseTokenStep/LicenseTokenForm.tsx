import { t } from "ttag";

import FormSubmitButton from "metabase/core/components/FormSubmitButton";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormTextInput,
} from "metabase/forms";
import { Box, Button, Flex } from "metabase/ui";

import { LICENSE_TOKEN_SCHEMA } from "./constants";

type LicenseTokenFormProps = {
  onSubmit: (token: string) => Promise<void>;
  onSkip: () => void;
  initialValue?: string;
};

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
