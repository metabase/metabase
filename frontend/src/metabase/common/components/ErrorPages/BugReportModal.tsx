import { useState } from "react";
import { c, t } from "ttag";

import FormTextArea from "metabase/common/components/FormTextArea";
import { Form, FormProvider, FormSubmitButton } from "metabase/forms";
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
  onSubmit: (values: Partial<Record<keyof ErrorPayload, boolean>>) => void;
  onSlackSubmit: (values: Partial<Record<keyof ErrorPayload, boolean>>) => void;
  canIncludeQueryData: boolean;
  applicationName: string;
  hiddenValues: Record<
    keyof Pick<ErrorPayload, "url" | "entityName" | "browserInfo">,
    boolean
  >;
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
        {(formik) => (
          <Form>
            <Text py="md">{t`Could you provide us with a little context?`}</Text>
            <FormTextArea
              name="description"
              autoFocus
              placeholder={t`What were you trying to do, and what steps did you take? What was the expected result, and what happened instead?`}
            />
            <Box
              bg={"accent-gray-light"}
              p="lg"
              my="md"
              style={{ borderRadius: "0.5rem" }}
            >
              <Flex align="flex-start" gap="md">
                <Stack gap="xs">
                  <Text size="lg" fw="bold">
                    {t`Include diagnostic information`}
                  </Text>
                  <Text color="text-secondary" w="80%">
                    {/* eslint-disable-next-line no-literal-metabase-strings -- this is a translation context string, not shown to users */}
                    {c("{0} is the name of the application, usually 'Metabase'")
                      .t`This information helps ${applicationName} figure out what exactly caused the issue.`}
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
              leftSection={isSlackSending ? <Loader size="xs" /> : null}
              onClick={() => onSlackSubmit(formik.values)}
              disabled={isSlackSending}
            >
              {isSlackSending ? t`Sending...` : t`Submit report`}
            </Button>
            <Divider my="md" />
            <Flex align="flex-start" justify="space-between" gap="md">
              <Box>
                <Text size="lg" fw="bold">{t`Download report`}</Text>
                <Text>{t`Diagnostic info may contain sensitive data.`}</Text>
              </Box>
              <FormSubmitButton
                variant="outline"
                label={c("This is a verb, not a noun").t`Download`}
                color="text-primary"
                my="sm"
                px="lg"
                radius="md"
              />
            </Flex>
          </Form>
        )}
      </FormProvider>
    </Modal>
  );
};
