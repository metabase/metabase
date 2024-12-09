import { useState } from "react";
import { c, t } from "ttag";
import _ from "underscore";

import ErrorBoundary from "metabase/ErrorBoundary";
import { getSlackSettings } from "metabase/admin/settings/slack/selectors";
import { useSendBugReportMutation } from "metabase/api/bug-report";
import { useSetting } from "metabase/common/hooks";
import Alert from "metabase/core/components/Alert";
import {
  Form,
  FormCheckbox,
  FormProvider,
  FormSubmitButton,
} from "metabase/forms";
import { useToggle } from "metabase/hooks/use-toggle";
import { capitalize } from "metabase/lib/formatting";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { closeDiagnostics } from "metabase/redux/app";
import { addUndo } from "metabase/redux/undo";
import { getIsErrorDiagnosticModalOpen } from "metabase/selectors/app";
import { getIsEmbedded } from "metabase/selectors/embed";
import { Button, Flex, Icon, Loader, Modal, Stack, Text } from "metabase/ui";

import type { ErrorPayload } from "./types";
import { useErrorInfo } from "./use-error-info";
import { downloadObjectAsJson, hasQueryData } from "./utils";

interface ErrorDiagnosticModalProps {
  errorInfo?: ErrorPayload | null;
  loading: boolean;
  onClose: () => void;
}

type PayloadSelection = Partial<Record<keyof ErrorPayload, boolean>>;

export const ErrorDiagnosticModal = ({
  errorInfo,
  loading,
  onClose,
}: ErrorDiagnosticModalProps) => {
  const dispatch = useDispatch();
  const [isSlackSending, setIsSlackSending] = useState(false);
  const [sendBugReport] = useSendBugReportMutation();
  const isBugReportingEnabled = useSetting("bug-reporting-enabled");

  const slackSettings = useSelector(getSlackSettings);
  const enableBugReportField = Boolean(
    slackSettings["slack-bug-report-channel"] &&
      slackSettings["slack-app-token"] &&
      isBugReportingEnabled,
  );

  if (loading || !errorInfo) {
    return (
      <Modal opened onClose={onClose}>
        <Stack align="center" justify="center" mb="lg">
          <Text w="bold" color="text-medium" mb="sm">
            {c(
              "loading message indicating that we are gathering debugging information to aid in providing technical support",
            ).t`Gathering diagnostic information...`}
          </Text>
          <Loader />
        </Stack>
      </Modal>
    );
  }

  const canIncludeQueryData = hasQueryData(errorInfo?.entityName);

  const hiddenValues = {
    url: true,
    entityName: true,
  };

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

  const handleSlackSubmit = async (values: PayloadSelection) => {
    setIsSlackSending(true);
    const selectedKeys = Object.keys(values).filter(
      key => values[key as keyof PayloadSelection],
    );
    const selectedInfo: ErrorPayload = _.pick(errorInfo, ...selectedKeys);

    try {
      const response = await sendBugReport({
        diagnosticInfo: selectedInfo,
      }).unwrap();

      if (response.success) {
        dispatch(
          addUndo({
            message: t`Diagnostic information sent to Slack successfully`,
          }),
        );
      } else {
        dispatch(
          addUndo({
            message: t`Failed to send diagnostic information to Slack`,
            icon: "warning",
            variant: "error",
          }),
        );
      }
    } catch (error) {
      console.error("Error sending to Slack:", error);
      dispatch(
        addUndo({
          message: t`Error sending diagnostic information to Slack`,
          icon: "warning",
          variant: "error",
        }),
      );
    } finally {
      setIsSlackSending(false);
      onClose();
    }
  };

  return (
    <Modal
      opened
      onClose={onClose}
      title={t`Download diagnostic information`}
      size="lg"
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
        onSubmit={handleSubmit}
      >
        {formik => (
          <Form>
            <Text>
              {t`Select the info you want to include in the diagnostic JSON file.`}
            </Text>
            <Stack spacing="md" my="lg">
              {canIncludeQueryData && (
                <FormCheckbox name="queryResults" label={t`Query results`} />
              )}
              {!!errorInfo.localizedEntityName && (
                <FormCheckbox
                  name="entityInfo"
                  label={t`${capitalize(
                    errorInfo.localizedEntityName,
                  )} definition`}
                />
              )}
              <FormCheckbox
                name="frontendErrors"
                label={t`Browser error messages`}
              />
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
                // eslint-disable-next-line no-literal-metabase-strings -- we're mucking around in the software here
                label={t`Metabase instance version information`}
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
              {enableBugReportField && (
                <Button
                  variant="filled"
                  leftIcon={
                    isSlackSending ? (
                      <Loader size="xs" />
                    ) : (
                      <Icon name="slack" />
                    )
                  }
                  onClick={() => handleSlackSubmit(formik.values)}
                  disabled={isSlackSending}
                >
                  {isSlackSending ? t`Sending...` : t`Send to Slack`}
                </Button>
              )}
            </Flex>
          </Form>
        )}
      </FormProvider>
    </Modal>
  );
};

export const ErrorDiagnosticModalTrigger = () => {
  const [isModalOpen, setModalOpen] = useState(false);

  if (getIsEmbedded()) {
    return null;
  }

  return (
    <ErrorBoundary>
      <Stack justify="center" my="lg">
        <Button
          leftIcon={<Icon name="download" />}
          onClick={() => setModalOpen(true)}
        >
          {t`Download diagnostic information`}
        </Button>
      </Stack>
      <ErrorDiagnosticModalWrapper
        isModalOpen={isModalOpen}
        onClose={() => setModalOpen(false)}
      />
    </ErrorBoundary>
  );
};

export const ErrorDiagnosticModalWrapper = ({
  isModalOpen,
  onClose,
}: {
  isModalOpen: boolean;
  onClose: () => void;
}) => {
  const {
    value: errorInfo,
    loading,
    error,
  } = useErrorInfo({ enabled: isModalOpen });

  if (!isModalOpen) {
    return null;
  }

  if (error) {
    console.error(error);
    return null;
  }

  return (
    <ErrorBoundary>
      {isModalOpen && (
        <ErrorDiagnosticModal
          loading={loading}
          errorInfo={errorInfo}
          onClose={onClose}
        />
      )}
    </ErrorBoundary>
  );
};

// this is an intermediate modal to give a better error explanation for use
// when an error component is potentially too small to contain text
export const ErrorExplanationModal = ({
  isModalOpen,
  onClose,
}: {
  isModalOpen: boolean;
  onClose: () => void;
}) => {
  const [
    isShowingDiagnosticModal,
    { turnOn: openDiagnosticModal, turnOff: closeDiagnosticModal },
  ] = useToggle(false);

  if (isModalOpen && isShowingDiagnosticModal) {
    return (
      <ErrorDiagnosticModalWrapper
        isModalOpen
        onClose={() => {
          onClose();
          closeDiagnosticModal();
        }}
      />
    );
  }

  return (
    <Modal
      title={t`Oops, something went wrong`}
      opened={isModalOpen}
      onClose={onClose}
    >
      <Text my="md">
        {t`We’ve run into an error, try to refresh the page or go back.`}
      </Text>
      <Text my="md">
        {c("indicates an email address to which to send diagnostic information")
          .jt`If the error persists, you can download diagnostic information`}
      </Text>
      <Flex justify="flex-end">
        <Button variant="filled" onClick={openDiagnosticModal}>
          {t`Download diagnostic info`}
        </Button>
      </Flex>
    </Modal>
  );
};

export const KeyboardTriggeredErrorModal = () => {
  const dispatch = useDispatch();
  const isShowingDiagnosticModal = useSelector(getIsErrorDiagnosticModalOpen);

  const handleCloseModal = () => {
    dispatch(closeDiagnostics());
  };

  const {
    value: errorInfo,
    loading,
    error,
  } = useErrorInfo({ enabled: isShowingDiagnosticModal });

  if (!isShowingDiagnosticModal || error) {
    return null;
  }

  return (
    <ErrorBoundary>
      <ErrorDiagnosticModal
        loading={loading}
        errorInfo={errorInfo}
        onClose={handleCloseModal}
      />
    </ErrorBoundary>
  );
};
