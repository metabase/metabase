import { useFormikContext } from "formik";
import type { ReactNode } from "react";
import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import CS from "metabase/css/core/index.css";
import { useFormContext, useFormErrorMessage } from "metabase/forms";
import { useSetting } from "metabase/settings";
import { Box } from "metabase/ui";
import type { DatabaseData } from "metabase-types/api";

const defaultCloudGatewayIPs = [
  "18.207.81.126",
  "3.211.20.157",
  "50.17.234.169",
];

export const useCloudGatewayIPs = () => {
  const ipAddresses = useSetting("cloud-gateway-ips");
  return ipAddresses || defaultCloudGatewayIPs;
};

/**
 * Renders a link to the specified docsUrl if showMetabaseLinks is true. Otherwise, returns the title raw string.
 */
export const getDocsLinkConditionally = (
  title: string,
  docsUrl: string,
  showMetabaseLinks: boolean,
): ReactNode => {
  let linkContent: ReactNode = title;

  if (showMetabaseLinks) {
    linkContent = (
      <Box
        className={CS.link}
        component={Link}
        fw={600}
        key={docsUrl}
        target="_blank"
        to={docsUrl}
      >
        {linkContent}
      </Box>
    );
  }

  return linkContent;
};

/**
 * Returned when a non-admin changes connection settings without re-entering the saved secrets they'd be sent with.
 * No connection was attempted, so connection troubleshooting doesn't apply.
 */
const SECRETS_REENTRY_REQUIRED = "secrets-reentry-required";

export const useDatabaseErrorDetails = () => {
  const { errors } = useFormikContext<DatabaseData>();
  const { errorCode } = useFormContext();
  const originalErrorMessage = useFormErrorMessage();
  const isSecretsReentryError = errorCode === SECRETS_REENTRY_REQUIRED;
  const isHostAndPortError =
    !isSecretsReentryError &&
    typeof errors?.details === "object" &&
    !!(errors?.details?.["host"] || errors?.details?.["port"]);
  const errorMessage = isHostAndPortError
    ? t`Make sure your Host and Port settings are correct.`
    : originalErrorMessage;

  return {
    errorMessage,
    isHostAndPortError,
    isSecretsReentryError,
  };
};
