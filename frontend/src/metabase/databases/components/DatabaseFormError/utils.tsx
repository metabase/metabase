import { useFormikContext } from "formik";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import CS from "metabase/css/core/index.css";
import { useFormErrorMessage } from "metabase/forms";
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

export const useDatabaseErrorDetails = () => {
  const { errors } = useFormikContext<DatabaseData>();
  const originalErrorMessage = useFormErrorMessage();
  const isHostAndPortError =
    typeof errors?.details === "object" &&
    !!(errors?.details?.["host"] || errors?.details?.["port"]);
  const errorMessage = isHostAndPortError
    ? t`Make sure your Host and Port settings are correct.`
    : originalErrorMessage;

  return {
    errorMessage,
    isHostAndPortError,
  };
};
