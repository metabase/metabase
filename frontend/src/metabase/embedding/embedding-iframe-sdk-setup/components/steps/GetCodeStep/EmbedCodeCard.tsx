import { c, t } from "ttag";

import { CodeEditor } from "metabase/common/components/CodeEditor";
import { useDocsUrl } from "metabase/common/hooks";
import { Anchor, Card, Divider, Stack, Text } from "metabase/ui";

import { UTM_LOCATION } from "../../../analytics";
import { CopyCodeSnippetButton } from "../../GetCode/CopyCodeSnippetButton";

interface EmbedCodeCardProps {
  snippet: string;
  onCopy: () => void;
}

const utmTags = {
  utm_source: "product",
  utm_campaign: "embedding_get_code",
  utm_content: UTM_LOCATION,
};

export const EmbedCodeCard = ({ snippet, onCopy }: EmbedCodeCardProps) => {
  // eslint-disable-next-line metabase/no-unconditional-metabase-links-render -- Only for admins
  const { url: docsUrl } = useDocsUrl("embedding/modular-embedding", {
    anchor: "add-the-embedding-script-to-your-app",
    utm: utmTags,
  });

  const docsLink = (
    <Anchor key="docs" href={docsUrl} target="_blank">
      {t`docs`}
    </Anchor>
  );

  return (
    <Card p="md">
      <Stack gap="xs" mb="md">
        <Text size="lg" fw="bold">
          {t`Embed code`}
        </Text>
        <Text size="sm" c="text-secondary">
          {c("{0} is a link labeled 'docs'")
            .jt`Add this snippet to your app. To modify this code and tweak additional options, refer to the ${docsLink}.`}
        </Text>
      </Stack>

      <Divider mb="md" />

      <Stack gap="sm">
        <div onCopy={onCopy}>
          <CodeEditor
            language="html"
            value={snippet}
            readOnly
            lineNumbers={false}
          />
        </div>

        <CopyCodeSnippetButton snippet={snippet} onCopy={onCopy} />
      </Stack>
    </Card>
  );
};
