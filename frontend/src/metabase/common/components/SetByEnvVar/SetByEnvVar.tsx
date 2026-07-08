import { jt } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { useDocsUrl } from "metabase/common/hooks";
import { Box } from "metabase/ui";

export const SetByEnvVar = ({ varName }: { varName: string }) => {
  // eslint-disable-next-line metabase/no-unconditional-metabase-links-render -- This component is only shown to admins.
  const { url } = useDocsUrl("configuring-metabase/environment-variables", {
    anchor: varName?.toLowerCase(),
  });

  return (
    <Box data-testid="setting-env-var-message" fw="bold" p="sm">
      {jt`This has been set by the ${(
        <ExternalLink key="link" href={url}>
          {varName}
        </ExternalLink>
      )} environment variable.`}
    </Box>
  );
};
