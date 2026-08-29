import { c, t } from "ttag";

import {
  Form,
  FormProvider,
  FormSubmitButton,
  FormTextarea,
} from "metabase/forms";
import { Modal, Text } from "metabase/ui";

import { DiagnosticCheckboxes } from "./DiagnosticCheckboxes";
import type { ErrorPayload } from "./types";

interface DownloadDiagnosticModalProps {
  errorInfo: ErrorPayload;
  onClose: () => void;
  onSubmit: (values: Partial<Record<keyof ErrorPayload, boolean>>) => void;
  canIncludeQueryData: boolean;
  applicationName: string;
  hiddenValues: Record<
    keyof Pick<ErrorPayload, "url" | "entityName" | "browserInfo">,
    boolean
  >;
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
    title={t`Gather diagnostic information`}
    size={550}
  >
    <FormProvider
      initialValues={{
        ...hiddenValues,
        reporter: true,
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
        <Text py="md">{t`Could you provide us with a little context?`}</Text>
        <FormTextarea
          name="description"
          data-autofocus
          placeholder={t`What were you trying to do, and what steps did you take? What was the expected result, and what happened instead?`}
          minRows={5}
          mb="md"
        />
        <Text>
          {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- this is a translation context string, not shown to users */}
          {c("{0} is the name of the application, usually 'Metabase'")
            .t`This information helps ${applicationName} figure out what exactly caused the issue`}
        </Text>
        <DiagnosticCheckboxes
          canIncludeQueryData={canIncludeQueryData}
          errorInfo={errorInfo}
          applicationName={applicationName}
        />
        <FormSubmitButton
          variant="filled"
          label={c("This is a verb, not a noun").t`Download`}
          color="core-brand"
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
