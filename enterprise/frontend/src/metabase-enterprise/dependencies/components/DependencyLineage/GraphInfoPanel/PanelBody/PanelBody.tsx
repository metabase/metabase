import { t } from "ttag";

import { Box, Stack, Title } from "metabase/ui";
import type { DependencyNode } from "metabase-types/api";

import { getNodeDescription } from "../../utils";

import S from "./PanelBody.module.css";

type PanelBodyProps = {
  node: DependencyNode;
};

export function PanelBody({ node }: PanelBodyProps) {
  return (
    <Box className={S.body} pl="lg" pr="lg" pb="lg">
      <DescriptionInfo node={node} />
    </Box>
  );
}

type DescriptionInfoProps = {
  node: DependencyNode;
};

function DescriptionInfo({ node }: DescriptionInfoProps) {
  const description = getNodeDescription(node);

  return (
    <Stack gap="sm">
      <Title order={6}>{t`Description`}</Title>
      <Box c={description ? "text-primary" : "text-secondary"}>
        {description ?? t`No description`}
      </Box>
    </Stack>
  );
}
