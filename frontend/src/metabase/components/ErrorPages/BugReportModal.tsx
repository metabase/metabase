import { useState } from "react";
import { t } from "ttag";

import FormTextArea from "metabase/core/components/FormTextArea";
import { Form, FormProvider, FormSubmitButton } from "metabase/forms";
import { trackSimpleEvent } from "metabase/lib/analytics";
import {
  Box,
  Button,
  Divider,
  Flex,
  Loader,
  Modal,
  Stack,
  Text,
} from "metabase/ui";

import { DiagnosticCheckboxes } from "./DiagnosticCheckboxes";
import type { ErrorPayload } from "./types";

interface BugReportModalProps {
  errorInfo: ErrorPayload;
  onClose: () => void;
  onSubmit: (values: any) => void;
  onSlackSubmit: (values: any) => void;
  canIncludeQueryData: boolean;
  applicationName: string;
  hiddenValues: Record<string, boolean>;
  isSlackSending: boolean;
}

export const BugReportModal = ({
  errorInfo,
  onClose,
  onSubmit,
  onSlackSubmit,
  canIncludeQueryData,
  applicationName,
  hiddenValues,
  isSlackSending,
}: BugReportModalProps) => {
  const [isDetailsVisible, setIsDetailsVisible] = useState(false);

  return (
    <Modal opened onClose={onClose} title={t`Report a bug`} size={550}>
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
        {formik => (
          <Form>
            <Text py="md">
              {t`What were you trying to do, and what steps did you take? What was the expected result, and what happened instead?`}
            </Text>
            <FormTextArea name="description" autoFocus />
            <Box bg="#FAFAFB" p="lg" my="md" style={{ borderRadius: "0.5rem" }}>
              <Flex align="flex-start" gap="md">
                <Stack spacing="xs">
                  <Text size="lg" weight="bold">
                    {t`Include diagnostic information`}
                  </Text>
                  <Text color="text-medium" w="80%">
                    {t`This information helps ${applicationName} figure out what exactly caused the issue.`}
                  </Text>
                </Stack>
                <Button
                  variant="subtle"
                  p="0"
                  fz="lg"
                  miw="fit-content"
                  onClick={() => setIsDetailsVisible(!isDetailsVisible)}
                >
                  {isDetailsVisible ? t`Done` : t`Edit`}
                </Button>
              </Flex>
              {isDetailsVisible && (
                <DiagnosticCheckboxes
                  canIncludeQueryData={canIncludeQueryData}
                  errorInfo={errorInfo}
                  applicationName={applicationName}
                />
              )}
            </Box>
            <Button
              variant="filled"
              leftIcon={isSlackSending ? <Loader size="xs" /> : null}
              onClick={() => {
                trackSimpleEvent({
                  event: "error_diagnostic_modal_submitted",
                  event_detail: "submit-report",
                });
                onSlackSubmit(formik.values);
              }}
              disabled={isSlackSending}
            >
              {isSlackSending ? t`Sending...` : t`Submit report`}
            </Button>
            <Divider my="md" />
            <Flex align="flex-start" justify="space-between" gap="md">
              <Box>
                <Text size="lg" weight="bold">{t`Download report`}</Text>
                <Text>{t`Diagnostic info may contain sensitive data.`}</Text>
              </Box>
              <FormSubmitButton
                variant="outline"
                label={t`Download`}
                color="text-dark"
                my="sm"
                px="lg"
                radius="md"
                onClick={() =>
                  trackSimpleEvent({
                    event: "error_diagnostic_modal_submitted",
                    event_detail: "download-diagnostics",
                  })
                }
              />
            </Flex>
          </Form>
        )}
      </FormProvider>
    </Modal>
  );
};
