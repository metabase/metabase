/* eslint-disable react/prop-types */
import { t } from "ttag";
import { useAsync } from "react-use";
import { useState } from "react";
import { color } from "metabase/lib/colors";
import {
  UtilApi,
  CardApi,
  DashboardApi,
  CollectionsApi,
  MetabaseApi,
} from "metabase/services";

import type { ErrorDetailsProps } from "metabase/components/ErrorDetails/types";
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
import EmptyState from "metabase/components/EmptyState";
import ErrorDetails from "metabase/components/ErrorDetails/ErrorDetails";

import NoResults from "assets/img/no_results.svg";
import { b64url_to_utf8 } from "metabase/lib/encoding";
import Link from "metabase/core/components/Link";
import {
  Form,
  FormCheckbox,
  FormProvider,
  FormSubmitButton,
} from "metabase/forms";
import { ErrorPageRoot } from "./ErrorPages.styled";

export const GenericError = ({
  title = t`Something's gone wrong`,
  message = t`We've run into an error. You can try refreshing the page, or just go back.`,
  details,
}: {
  title?: string;
  message?: string;
  details: ErrorDetailsProps["details"];
}) => (
  <ErrorPageRoot>
    <EmptyState
      title={title}
      message={message}
      illustrationElement={
        <div className="QueryError-image QueryError-image--serverError" />
      }
    />
    <ErrorDetails className="pt2" details={details} centered />
    <ReportableError />
  </ErrorPageRoot>
);

export const NotFound = ({
  title = t`We're a little lost...`,
  message = t`The page you asked for couldn't be found.`,
}: {
  title?: string;
  message?: string;
}) => (
  <ErrorPageRoot aria-label="error page">
    <EmptyState
      illustrationElement={<img src={NoResults} />}
      title={title}
      message={message}
    />
  </ErrorPageRoot>
);

export const Unauthorized = () => (
  <ErrorPageRoot>
    <EmptyState
      title={t`Sorry, you don’t have permission to see that.`}
      illustrationElement={<Icon name="key" size={100} />}
    />
  </ErrorPageRoot>
);

export const Archived = ({
  entityName,
  linkTo,
}: {
  entityName: string;
  linkTo: string;
}) => (
  <ErrorPageRoot>
    <EmptyState
      title={t`This ${entityName} has been archived`}
      illustrationElement={<Icon name="view_archive" size={100} />}
      link={linkTo}
    />
  </ErrorPageRoot>
);

export const SmallGenericError = ({ message = t`Something's gone wrong` }) => (
  <ErrorPageRoot>
    <Icon
      name="warning"
      size={32}
      color={color("text-light")}
      tooltip={message}
    />
    <ReportableError />
  </ErrorPageRoot>
);

const getEntityDetails = ({ entity, id, isAdHoc }: any) => {
  if (!id) {
    return Promise.resolve(null);
  }

  switch (entity) {
    case "question":
      if (isAdHoc) {
        try {
          const adhocQuestion = JSON.parse(b64url_to_utf8(id));
          return Promise.resolve(adhocQuestion);
        } catch (e) {
          return Promise.resolve("unable to decode ad-hoc question");
        }
      }
      return CardApi.get({ cardId: id });
    case "dashboard":
      return DashboardApi.get({ id });
    case "collection":
      return CollectionsApi.get({ id });
    default:
      return Promise.resolve(null);
  }
};

function downloadObjectAsJson(exportObj: any, exportName: string) {
  const dataStr =
    "data:text/json;charset=utf-8," +
    encodeURIComponent(JSON.stringify(exportObj));
  const downloadAnchorNode = document.createElement("a");
  downloadAnchorNode.setAttribute("href", dataStr);
  downloadAnchorNode.setAttribute("download", exportName + ".json");
  document.body.appendChild(downloadAnchorNode);
  downloadAnchorNode.click();
  downloadAnchorNode.remove();
}

export const ReportableError = () => {
  const location = window.location.href;

  const matches = location.match(
    /(question|dashboard|collection)[[\/\#]([\d\w]+)/,
  );

  const entity = matches?.[1] ?? "";
  const id = matches?.[2] ?? "";

  const {
    value: errorInfo,
    loading,
    error,
  } = useAsync(async () => {
    // https://regexr.com/7ra8o

    const isAdHoc = entity === "question" && location.includes("#");
    const entityInfoRequest = getEntityDetails({ entity, id, isAdHoc });
    const bugReportDetailsRequest = UtilApi.bug_report_details();
    const logsRequest: any = UtilApi.logs();

    /* eslint-disable no-console */
    // @ts-expect-error I'm sorry
    const frontendErrors = console.errorBuffer;
    /* eslint-enable no-console */

    const settledPromises = await Promise.allSettled([
      entityInfoRequest,
      bugReportDetailsRequest,
      logsRequest,
    ]);

    const [entityInfo, bugReportDetails, logs] = settledPromises.map(
      (promise: any) => promise.value,
    );
    const queryData =
      entity === "question" &&
      entityInfo?.dataset_query &&
      (await MetabaseApi.dataset(entityInfo.dataset_query));

    const filteredLogs = logs?.slice?.(0, 100);
    const backendErrors = logs?.filter?.((log: any) => log.level === "ERROR");

    return {
      url: location,
      [entity]: entityInfo,
      ...(queryData ? { queryData } : undefined),
      logs: filteredLogs,
      frontendErrors,
      backendErrors,
      bugReportDetails,
    };
  });

  const [opened, setOpened] = useState(false);

  const downloadErrorFile = (data: any) => {
    downloadObjectAsJson(
      data,
      `metabase-diagnostic-info-${new Date().toISOString()}`,
    );
  };

  if (loading) {
    return (
      <Center>
        <Loader />
      </Center>
    );
  }

  if (error) {
    return null;
  }

  return (
    <Stack justify="center" my="lg">
      <Box>
        <Text align="center">
          Click the button below to download diagnostic information to send
          to&nbsp;
          <Link variant="brand" to="mailto:help@metabase.com">
            help@metabase.com
          </Link>
        </Text>
      </Box>
      <Button
        leftIcon={<Icon name="download" />}
        onClick={() => setOpened(true)}
      >
        Download diagnostic information for Jacob
      </Button>
      {opened && (
        <ErrorDownloadOptionsModal
          errorInfo={errorInfo}
          onDownload={downloadErrorFile}
          entity={entity}
          onClose={() => setOpened(false)}
        />
      )}
    </Stack>
  );
};

export const ErrorDownloadOptionsModal = ({
  errorInfo,
  onDownload,
  entity,
  onClose,
}: any) => {
  const handleSubmit = values => {
    const selectedInfo = Object.entries(values).reduce((acc, [key, value]) => {
      if (value) {
        acc[key] = errorInfo[key];
      }
      return acc;
    }, {});
    onDownload(selectedInfo);
    onClose();
  };

  return (
    <Modal
      opened
      onClose={onClose}
      styles={{ header: { fontSize: "16px" } }}
      title={t`Select the information you want to include in the diagnostic file`}
    >
      <FormProvider
        initialValues={{
          frontendErrors: true,
          backendErrors: true,
          logs: true,
          entityInfo: true,
          queryData: true,
        }}
        onSubmit={handleSubmit}
      >
        <Form>
          <Stack spacing="md">
            <FormCheckbox
              name="frontendErrors"
              label={t`Include frontend error messages`}
            />
            <FormCheckbox
              name="backendErrors"
              label={t`Include backend error messages`}
            />
            {!!entity && (
              <>
                <FormCheckbox
                  name="entityInfo"
                  label={t`Include ${entity} data`}
                />
                {entity === "question" && (
                  <FormCheckbox
                    name="queryData"
                    label={t`Include query data`}
                  />
                )}
              </>
            )}
            <FormCheckbox name="logs" label={t`Include backend logs`} />
          </Stack>
          <Flex gap="sm" justify="flex-end" mt="lg">
            <Button onClick={onClose}>{t`Cancel`}</Button>
            <FormSubmitButton
              variant="filled"
              leftIcon={<Icon name="download" />}
              label={t`Download diagnostic information`}
              color="brand"
            />
          </Flex>
        </Form>
      </FormProvider>
    </Modal>
  );
};
