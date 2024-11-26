import { t } from "ttag";

import { FormCheckbox } from "metabase/forms";
import { capitalize } from "metabase/lib/formatting";
import { Stack } from "metabase/ui";

import type { ErrorPayload } from "./types";

interface DiagnosticCheckboxesProps {
  canIncludeQueryData: boolean;
  errorInfo: ErrorPayload;
  applicationName: string;
}

export const DiagnosticCheckboxes = ({
  canIncludeQueryData,
  errorInfo,
  applicationName,
}: DiagnosticCheckboxesProps) => (
  <Stack spacing="md" pt="md">
    {canIncludeQueryData && (
      <FormCheckbox name="queryResults" label={t`Query results`} />
    )}
    {!!errorInfo.localizedEntityName && (
      <FormCheckbox
        name="entityInfo"
        label={t`${capitalize(errorInfo.localizedEntityName)} definition`}
      />
    )}
    <FormCheckbox name="frontendErrors" label={t`Browser error messages`} />
    {!!errorInfo?.logs && (
      <>
        <FormCheckbox
          name="backendErrors"
          label={t`All server error messages`}
        />
        <FormCheckbox name="logs" label={t`All server logs`} />
        <FormCheckbox
          name="userLogs"
          label={t`Server logs from the current user only`}
        />
      </>
    )}
    <FormCheckbox
      name="bugReportDetails"
      label={t`${applicationName} instance version information`}
    />
  </Stack>
);
