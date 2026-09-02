import { jt } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { useDocsUrl } from "metabase/common/hooks";
import { Box } from "metabase/ui";

export const SetByEnvVar = ({
  varName,
  canOnlyBeSet,
}: {
  varName: string;
  canOnlyBeSet?: boolean;
}) => {
  // eslint-disable-next-line metabase/no-unconditional-metabase-links-render -- This component is only shown to admins.
  const { url } = useDocsUrl("configuring-metabase/environment-variables", {
    anchor: varName?.toLowerCase(),
  });

  const link = (
    <ExternalLink key="link" href={url}>
      {varName}
    </ExternalLink>
  );

  return (
    <Box data-testid="setting-env-var-message" fw="bold" p="sm">
      {canOnlyBeSet
        ? jt`This setting can only be set by the ${link} environment variable.`
        : jt`This has been set by the ${link} environment variable.`}
    </Box>
  );
};
