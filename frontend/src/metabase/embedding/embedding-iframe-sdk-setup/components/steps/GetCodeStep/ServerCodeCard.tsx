import { t } from "ttag";

import { CodeEditor } from "metabase/common/components/CodeEditor";
import { EmbedServerSnippetLanguageSelect } from "metabase/embedding/components/EmbedServerSnippetLanguageSelect/EmbedServerSnippetLanguageSelect";
import { MoreServerSnippetExamplesLink } from "metabase/embedding/components/MoreServerSnippetExamplesLink/MoreServerSnippetExamplesLink";
import { Card, Flex, Stack, Text } from "metabase/ui";

import type { useSdkIframeEmbedServerSnippet } from "../../../hooks/use-sdk-iframe-embed-server-snippet";
import { CopyCodeSnippetButton } from "../../GetCode/CopyCodeSnippetButton";

type ServerSnippetData = NonNullable<
  ReturnType<typeof useSdkIframeEmbedServerSnippet>
>;

interface ServerCodeCardProps {
  serverSnippetData: ServerSnippetData;
  onCopy: () => void;
}

export const ServerCodeCard = ({
  serverSnippetData,
  onCopy,
}: ServerCodeCardProps) => (
  <Card p="md">
    <Flex align="baseline" justify="space-between">
      <Text size="lg" fw="bold" mb="md">
        {t`Server code`}
      </Text>

      <EmbedServerSnippetLanguageSelect
        languageOptions={serverSnippetData.serverSnippetOptions}
        selectedOptionId={serverSnippetData.selectedServerSnippetId}
        onChangeOption={serverSnippetData.setSelectedServerSnippetId}
      />
    </Flex>

    <Stack gap="sm">
      <CodeEditor
        language={serverSnippetData.serverSnippetOption.language}
        value={serverSnippetData.serverSnippetOption.source}
        readOnly
        lineNumbers={false}
      />

      <CopyCodeSnippetButton
        snippet={serverSnippetData.serverSnippetOption.source}
        onCopy={onCopy}
      />

      <MoreServerSnippetExamplesLink />
    </Stack>
  </Card>
);
