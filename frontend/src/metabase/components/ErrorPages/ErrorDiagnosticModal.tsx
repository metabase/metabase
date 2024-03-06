import { useState, useEffect } from "react";
import { t, jt } from "ttag";
import _ from "underscore";

import ErrorBoundary from "metabase/ErrorBoundary";
import Alert from "metabase/core/components/Alert";
import Link from "metabase/core/components/Link";
import {
  Form,
  FormCheckbox,
  FormProvider,
  FormSubmitButton,
} from "metabase/forms";
import { useToggle } from "metabase/hooks/use-toggle";
import { capitalize } from "metabase/lib/formatting";
import {
  Button,
  Center,
  Icon,
  Loader,
  Text,
  Stack,
  Box,
  Modal,
  Flex,
} from "metabase/ui";

import type { ErrorPayload } from "./types";
import { useErrorInfo } from "./use-error-info";
import { downloadObjectAsJson, hasQueryData } from "./utils";

export const ReportableError = () => {
  const { value: errorInfo, loading, error } = useErrorInfo();

  const [isModalOpen, setModalOpen] = useState(false);

  if (loading || !errorInfo) {
    return (
      <Center>
        <Loader />
      </Center>
    );
  }

  if (error) {
    console.error(error);
    return null;
  }

  return (
    <ErrorBoundary>
      <Stack justify="center" my="lg">
        <Box>
          <Text align="center">
            {jt`Click the button below to download diagnostic information to send
            to
            ${(
              <Link variant="brand" to="mailto:help@metabase.com">
                {t`help@metabase.com`}
              </Link>
            )}`}
          </Text>
        </Box>
        <Button
          leftIcon={<Icon name="download" />}
          onClick={() => setModalOpen(true)}
        >
          {t`Download diagnostic information`}
        </Button>
      </Stack>
      {isModalOpen && (
        <ErrorDiagnosticModal
          errorInfo={errorInfo}
          onClose={() => setModalOpen(false)}
        />
      )}
    </ErrorBoundary>
  );
};

interface ErrorDiagnosticModalProps {
  errorInfo: ErrorPayload;
  onClose: () => void;
}

type PayloadSelection = Partial<Record<keyof ErrorPayload, boolean>>;

export const ErrorDiagnosticModal = ({
  errorInfo,
  onClose,
}: ErrorDiagnosticModalProps) => {
  const handleSubmit = (values: PayloadSelection) => {
    const selectedKeys = Object.keys(values).filter(
      key => values[key as keyof PayloadSelection],
    );
    const selectedInfo: ErrorPayload = _.pick(errorInfo, ...selectedKeys);

    downloadObjectAsJson(
      selectedInfo,
      `metabase-diagnostic-info-${new Date().toISOString()}`,
    );
    onClose();
  };

  const canIncludeQueryData = hasQueryData(errorInfo?.entityName);

  const hiddenValues = {
    url: true,
    entityName: true,
  };

  return (
    <Modal
      opened
      onClose={onClose}
      title={t`Download diagnostic information`}
      padding="xl"
    >
      <FormProvider
        initialValues={{
          ...hiddenValues,
          entityInfo: true,
          queryData: canIncludeQueryData,
          frontendErrors: true,
          backendErrors: true,
          userLogs: true,
          logs: true,
          instanceInfo: true,
        }}
        onSubmit={handleSubmit}
      >
        <Form>
          <Text>
            {t`Select the info you want to include in the diagnostic JSON file.`}
          </Text>
          <Stack spacing="md" p="lg">
            {!!errorInfo.localizedEntityName && (
              <FormCheckbox
                name="entityInfo"
                label={t`${capitalize(errorInfo.localizedEntityName)} data`}
              />
            )}
            {canIncludeQueryData && (
              <FormCheckbox name="queryData" label={t`Query data`} />
            )}
            <FormCheckbox
              name="frontendErrors"
              label={t`Browser error messages`}
            />
            {!!errorInfo?.logs && (
              <Stack>
                <FormCheckbox
                  name="backendErrors"
                  label={t`All server error messages`}
                />
                <FormCheckbox name="logs" label={t`Include all server logs`} />
                <FormCheckbox
                  name="userLogs"
                  label={t`Server logs from the current user only`}
                />
              </Stack>
            )}
            <FormCheckbox
              name="instanceInfo"
              // eslint-disable-next-line no-literal-metabase-strings -- we're mucking around in the software here
              label={t`Metabase version and settings`}
            />
          </Stack>
          <Alert variant="warning">
            {t`Review the downloaded file before sharing it, as the diagnostic info may contain sensitive data.`}
          </Alert>
          <Flex gap="sm" justify="flex-end" mt="lg">
            <Button onClick={onClose}>{t`Cancel`}</Button>
            <FormSubmitButton
              variant="filled"
              leftIcon={<Icon name="download" />}
              label={t`Download`}
              color="brand"
            />
          </Flex>
        </Form>
      </FormProvider>
    </Modal>
  );
};

export function KeyboardTriggeredErrorModal() {
  const [
    isShowingDiagnosticModal,
    { turnOn: openDiagnosticModal, turnOff: closeDiagnosticModal },
  ] = useToggle(false);

  useEffect(() => {
    const keyboardListener = (event: KeyboardEvent) => {
      if (event.key === "F1" && (event.ctrlKey || event.metaKey)) {
        openDiagnosticModal();
      }
    };
    window.addEventListener("keydown", keyboardListener);
    return () => {
      window.removeEventListener("keydown", keyboardListener);
    };
  }, [openDiagnosticModal]);

  const {
    value: errorInfo,
    loading,
    error,
  } = useErrorInfo({ enabled: isShowingDiagnosticModal });

  if (!isShowingDiagnosticModal || error) {
    return null;
  }

  if (loading || !errorInfo) {
    return (
      <Modal opened onClose={closeDiagnosticModal}>
        <Stack align="center" justify="center" mb="lg">
          <Text w="bold" color="text-medium" mb="sm">
            {t`Gathering diagnostic information...`}
          </Text>
          <Loader />
        </Stack>
      </Modal>
    );
  }

  return (
    <ErrorBoundary>
      <ErrorDiagnosticModal
        errorInfo={errorInfo}
        onClose={closeDiagnosticModal}
      />
    </ErrorBoundary>
  );
}
