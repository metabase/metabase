import { useEffect, useState } from "react";
import { c, t } from "ttag";
import _ from "underscore";

import ErrorBoundary from "metabase/ErrorBoundary";
import { useSendBugReportMutation } from "metabase/api/bug-report";
import { MetabotLogo } from "metabase/common/components/MetabotLogo";
import { useSetting } from "metabase/common/hooks";
import { useToggle } from "metabase/common/hooks/use-toggle";
import { downloadObjectAsJson } from "metabase/lib/download";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { closeDiagnostics } from "metabase/redux/app";
import { addUndo } from "metabase/redux/undo";
import { getIsErrorDiagnosticModalOpen } from "metabase/selectors/app";
import { getIsEmbeddingIframe } from "metabase/selectors/embed";
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
import { hasQueryData } from "./utils";

interface ErrorDiagnosticModalProps {
  errorInfo?: ErrorPayload | null;
  loading: boolean;
  onClose: () => void;
}

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

  if (loading || !errorInfo) {
    return (
      <Modal opened onClose={onClose}>
        <Stack align="center" justify="center" mb="lg">
          <Text w="bold" color="text-secondary" mb="sm">
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

  const handleSubmit = (values: Record<string, boolean | string>) => {
    trackErrorDiagnosticModalSubmitted("download-diagnostics");
    const { description, ...diagnosticSelections } = values;

    const selectedKeys = Object.keys(diagnosticSelections).filter(
      (key) => diagnosticSelections[key],
    );
    const selectedInfo = {
      ..._.pick(errorInfo, ...selectedKeys),
      description,
    };

    downloadObjectAsJson(
      selectedInfo,
      `metabase-diagnostic-info-${new Date().toISOString()}`,
    );
    onClose();
  };

  const handleSlackSubmit = async (values: Record<string, any>) => {
    setIsSlackSending(true);
    const { description, ...diagnosticSelections } = values;

    const selectedKeys = Object.keys(diagnosticSelections).filter(
      (key) => diagnosticSelections[key],
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
        <Stack gap="sm" align="center" py="xl">
          <MetabotLogo
            variant="bug"
            alt={c(
              "Alt text for image shown on successful bug report submission",
            ).t`Bug report submitted`}
            style={{ height: "100px", width: "100px" }}
          />
          <Text ta="center" size="lg" fw="bold">
            {t`Thank you for your feedback!`}
          </Text>
          <Text ta="center" c="text-secondary">
            {t`Bug report submitted successfully.`}
          </Text>
          <Button mt="xl" onClick={onClose}>{t`Close`}</Button>
        </Stack>
      </Modal>
    );
  }

  return isBugReportingEnabled ? (
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

  if (getIsEmbeddingIframe()) {
    return null;
  }

  return (
    <ErrorBoundary>
      <Stack justify="center" my="lg">
        <Button
          leftSection={<Icon name="download" />}
          onClick={() => setModalOpen(true)}
        >
          {t`Gather diagnostic information`}
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
        {t`If the error persists, you can download diagnostic information`}
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
