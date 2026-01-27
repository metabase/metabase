import { jt, t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { Box, Center } from "metabase/ui";

export const MoreServerSnippetExamplesLink = () => (
  <Box my="1rem">
    <Center>
      <h4>{jt`More ${(
        <ExternalLink
          key="examples"
          href="https://github.com/metabase/embedding-reference-apps"
        >
          {t`examples on GitHub`}
        </ExternalLink>
      )}`}</h4>
    </Center>
  </Box>
);
