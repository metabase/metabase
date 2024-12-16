import { useEffect, useState } from "react";
import { c, t } from "ttag";
import _ from "underscore";

import ErrorBoundary from "metabase/ErrorBoundary";
import { getSlackSettings } from "metabase/admin/settings/slack/selectors";
import { useSendBugReportMutation } from "metabase/api/bug-report";
import { useSetting } from "metabase/common/hooks";
import { useToggle } from "metabase/hooks/use-toggle";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { closeDiagnostics } from "metabase/redux/app";
import { addUndo } from "metabase/redux/undo";
import { getIsErrorDiagnosticModalOpen } from "metabase/selectors/app";
import { getIsEmbedded } from "metabase/selectors/embed";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { Button, Flex, Icon, Loader, Modal, Stack, Text } from "metabase/ui";

import { BugReportModal } from "./BugReportModal";
import { DownloadDiagnosticModal } from "./DownloadDiagnosticModal";
import {
  trackErrorDiagnosticModalOpened,
  trackErrorDiagnosticModalSubmitted,
} from "./analytics";
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
  const [isSubmissionComplete, setIsSubmissionComplete] = useState(false);
  const applicationName = useSelector(getApplicationName);

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
    browserInfo: true,
  };

  const handleSubmit = (values: PayloadSelection) => {
    trackErrorDiagnosticModalSubmitted("download-diagnostics");
    const selectedKeys = Object.keys(values).filter(
      key => values[key as keyof PayloadSelection],
    );
    const selectedInfo: Partial<ErrorPayload> = _.pick(
      errorInfo,
      ...selectedKeys,
    );

    downloadObjectAsJson(
      selectedInfo,
      `metabase-diagnostic-info-${new Date().toISOString()}`,
    );
    onClose();
  };

  const handleSlackSubmit = async (
    values: Record<string, boolean | string>,
  ) => {
    setIsSlackSending(true);
    const { description, ...diagnosticSelections } = values;

    const selectedKeys = Object.keys(diagnosticSelections).filter(
      key => diagnosticSelections[key],
    );
    const selectedInfo = {
      ..._.pick(errorInfo, ...selectedKeys),
      description,
    };

    try {
      const response = await sendBugReport({
        diagnosticInfo: selectedInfo,
      }).unwrap();

      if (response.success) {
        trackErrorDiagnosticModalSubmitted("submit-report");
        setIsSubmissionComplete(true);
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
    }
  };

  if (isSubmissionComplete) {
    return (
      <Modal opened onClose={onClose} size={550}>
        <Stack spacing="sm" align="center" py="xl">
          <img
            src="app/assets/img/metabot-bug-report.svg"
            alt={c(
              "Alt text for image shown on successful bug report submission",
            ).t`Bug report submitted`}
            style={{ width: 100, height: 100 }}
          />
          <Text align="center" size="lg" weight="bold">
            {t`Thank you for your feedback!`}
          </Text>
          <Text align="center" color="text-medium">
            {t`Bug report submitted successfully.`}
          </Text>
          <Button mt="xl" onClick={onClose}>{t`Close`}</Button>
        </Stack>
      </Modal>
    );
  }

  return enableBugReportField ? (
    <BugReportModal
      errorInfo={errorInfo}
      onClose={onClose}
      onSubmit={handleSubmit}
      onSlackSubmit={handleSlackSubmit}
      canIncludeQueryData={canIncludeQueryData}
      applicationName={applicationName}
      hiddenValues={hiddenValues}
      isSlackSending={isSlackSending}
    />
  ) : (
    <DownloadDiagnosticModal
      errorInfo={errorInfo}
      onClose={onClose}
      onSubmit={handleSubmit}
      canIncludeQueryData={canIncludeQueryData}
      applicationName={applicationName}
      hiddenValues={hiddenValues}
    />
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

  useEffect(() => {
    if (isShowingDiagnosticModal) {
      trackErrorDiagnosticModalOpened("command-palette");
    }
  }, [isShowingDiagnosticModal]);

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
