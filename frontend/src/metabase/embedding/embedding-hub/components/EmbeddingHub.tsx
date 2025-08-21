import cx from "classnames";
import { useMemo } from "react";
import { c, t } from "ttag";

import ExternalLink from "metabase/common/components/ExternalLink";
import { useDocsUrl } from "metabase/common/hooks";
import CS from "metabase/css/core/index.css";
import { Box, Text, Title } from "metabase/ui";

import { useCompletedEmbeddingHubSteps } from "../hooks";
import { getEmbeddingHubSteps } from "../utils";

import { EmbeddingChecklist } from "./EmbeddingChecklist";

export const EmbeddingHub = () => {
  const embeddingSteps = useMemo(() => getEmbeddingHubSteps(), []);
  const completedSteps = useCompletedEmbeddingHubSteps();

  // Find the first unchecked step to open by default
  const firstUncompletedStep = embeddingSteps.find(
    (step) => !completedSteps[step.id],
  );

  // This will be undefined when every step has been completed.
  const defaultOpenStep = firstUncompletedStep?.id;

  // eslint-disable-next-line no-unconditional-metabase-links-render -- This links only shows for admins.
  const embedJsDocsUrl = useDocsUrl("embedding/embedded-analytics-js");

  return (
    <Box mih="100%" px="lg" py="xl" bg="bg-white">
      <Box maw={600} mx="auto">
        <Title order={1} mb="sm" c="text-dark">{t`Embedding hub`}</Title>

        <Text mb="xl" c="text-medium">
          {c("{0} is the link to the selected embedding type.")
            .jt`Get started with ${(<ExternalLink href={embedJsDocsUrl?.url} className={cx(CS.textBold, CS.link)}>{t`Embedded Analytics JS`}</ExternalLink>)}.`}
        </Text>

        <EmbeddingChecklist
          steps={embeddingSteps}
          completedSteps={completedSteps}
          defaultOpenStep={defaultOpenStep}
        />
      </Box>
    </Box>
  );
};
