import { useCallback } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import FormErrorMessage from "metabase/common/components/FormErrorMessage";
import FormInput from "metabase/common/components/FormInput";
import FormSubmitButton from "metabase/common/components/FormSubmitButton";
import { useSetting } from "metabase/common/hooks";
import { Form, FormProvider } from "metabase/forms";
import * as Errors from "metabase/lib/errors";
import type { SlackSettings } from "metabase-types/api";

const SLACK_SCHEMA = Yup.object({
  "slack-app-token": Yup.string().ensure().required(Errors.required),
  "slack-bug-report-channel": Yup.string()
    .nullable()
    .default(null)
    .transform((value, originalValue) => (originalValue === "" ? null : value))
    .lowercase(),
});

export interface SlackFormProps {
  initialValues: SlackSettings;
  isReadOnly?: boolean;
  onSubmit?: (values: SlackSettings) => void;
}

const SlackForm = ({
  initialValues,
  isReadOnly,
  onSubmit = () => undefined,
}: SlackFormProps): JSX.Element => {
  const isBugReportingEnabled = useSetting("bug-reporting-enabled");
  const handleSubmit = useCallback(
    (values: SlackSettings) =>
      onSubmit(SLACK_SCHEMA.cast(values) as SlackSettings),
    [onSubmit],
  );

  return (
    <FormProvider
      initialValues={initialValues}
      validationSchema={!isReadOnly ? SLACK_SCHEMA : undefined}
      onSubmit={handleSubmit}
    >
      <Form>
        <FormInput
          name="slack-app-token"
          title={t`Slack Bot User OAuth Token`}
          placeholder="xoxb-781236542736-2364535789652-GkwFDQoHqzXDVsC6GzqYUypD"
          readOnly={isReadOnly}
        />
        {isBugReportingEnabled && (
          <FormInput
            name="slack-bug-report-channel"
            title={t`Public channel for bug reports`}
            description={isReadOnly ? SLACK_BUG_REPORT_DESCRIPTION : undefined}
            placeholder="metabase-bugs"
            readOnly={isReadOnly}
          />
        )}
        {!isReadOnly && (
          <>
            <FormSubmitButton title={t`Save changes`} primary />
            <FormErrorMessage />
          </>
        )}
      </Form>
    </FormProvider>
  );
};

// eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
const SLACK_BUG_REPORT_DESCRIPTION = t`This channel will receive bug reports submitted by users.`;

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default SlackForm;
