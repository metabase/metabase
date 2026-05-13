import { t } from "ttag";

import { CodeEditor } from "metabase/common/components/CodeEditor";
import { Card, Stack, Text } from "metabase/ui";

import { CopyCodeSnippetButton } from "../../GetCode/CopyCodeSnippetButton";

interface EmbedCodeCardProps {
  snippet: string;
  onCopy: () => void;
}

export const EmbedCodeCard = ({ snippet, onCopy }: EmbedCodeCardProps) => (
  <Card p="md">
    <Text size="lg" fw="bold" mb="md">
      {t`Embed code`}
    </Text>

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
