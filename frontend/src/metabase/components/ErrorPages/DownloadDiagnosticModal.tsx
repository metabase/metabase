import { t } from "ttag";

import { Form, FormProvider, FormSubmitButton } from "metabase/forms";
import { Modal, Text } from "metabase/ui";

import { DiagnosticCheckboxes } from "./DiagnosticCheckboxes";
import type { ErrorPayload } from "./types";

interface DownloadDiagnosticModalProps {
  errorInfo: ErrorPayload;
  onClose: () => void;
  onSubmit: (values: any) => void;
  canIncludeQueryData: boolean;
  applicationName: string;
  hiddenValues: Record<string, boolean>;
}

export const DownloadDiagnosticModal = ({
  errorInfo,
  onClose,
  onSubmit,
  canIncludeQueryData,
  applicationName,
  hiddenValues,
}: DownloadDiagnosticModalProps) => (
  <Modal
    opened
    onClose={onClose}
    title={t`Download diagnostic information`}
    size={550}
  >
    <FormProvider
      initialValues={{
        ...hiddenValues,
        queryResults: false,
        entityInfo: true,
        frontendErrors: true,
        backendErrors: true,
        userLogs: true,
        logs: true,
        bugReportDetails: true,
      }}
      onSubmit={onSubmit}
    >
      <Form>
        <Text py="md">{t`This information helps ${applicationName} to figure out what exactly caused the issue`}</Text>
        <DiagnosticCheckboxes
          canIncludeQueryData={canIncludeQueryData}
          errorInfo={errorInfo}
          applicationName={applicationName}
        />
        <FormSubmitButton
          variant="filled"
          label={t`Download`}
          color="brand"
          mt="lg"
          mb="sm"
          px="lg"
          radius="md"
        />
        <Text>{t`Diagnostic info may contain sensitive data.`}</Text>
      </Form>
    </FormProvider>
  </Modal>
);
