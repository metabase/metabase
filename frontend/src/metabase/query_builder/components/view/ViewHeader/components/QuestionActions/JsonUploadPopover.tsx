import { jt, t } from "ttag";

import { CopyButton } from "metabase/components/CopyButton";
import { CopyTextInput } from "metabase/components/CopyTextInput";
import Link from "metabase/core/components/Link";
import { Box, Code, Flex, Popover, Text } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

export function JsonUploadPopover({
  question,
  isOpen,
  onClose,
}: {
  question: Question;
  isOpen: boolean;
  onClose: () => void;
}) {
  const url = `http://${window.location.host}/api/table/${question?._card?.table_id}/append-json`;

  const curlContent = `curl -X POST \\
  -H "Content-Type: application/json" \\
  -H "X-Api-Key: YOUR_API_KEY" \\
  -d '[{ "column1"\: "value1", "column2": "value2" }]' \\
  ${url}`;

  return (
    <Popover opened={isOpen} onChange={onClose} closeOnClickOutside>
      <Popover.Target>
        <span />
      </Popover.Target>
      <Popover.Dropdown>
        <Box p="lg" w="30rem">
          <Text pb="sm" fw="bold">{t`Upload JSON`}</Text>
          <Text mb="md" fz="sm" lh="md" c="text-medium">
            {jt`You can upload JSON data to this model by making a POST request to this URL with the JSON data in the request body and an ${(<Link to="/admin/settings/authentication/api-keys" key="api-key" variant="brandBold">{t`API Key`}</Link>)} in the x-api-key header.`}
          </Text>
          <CopyTextInput value={url} />
          <Flex mt="md" p="sm" bg="bg-light" justify="space-between">
            <Code block style={{ whiteSpace: "pre-wrap" }}>
              {curlContent}
            </Code>
            <CopyButton value={curlContent} />
          </Flex>
        </Box>
      </Popover.Dropdown>
    </Popover>
  );
}
