import { jt, t } from "ttag";

import ExternalLink from "metabase/core/components/ExternalLink";
import { Text } from "metabase/ui";

import { useEmbeddingSettingsLinks } from "./sdk";

export const DocumentationCta = () => {
  const { documentationUrl } = useEmbeddingSettingsLinks();

  return (
    <Text data-testid="sdk-documentation">
      {jt`Check out the ${(
        <ExternalLink key="sdk-doc" href={documentationUrl}>
          {t`documentation`}
        </ExternalLink>
      )} for more.`}
    </Text>
  );
};
