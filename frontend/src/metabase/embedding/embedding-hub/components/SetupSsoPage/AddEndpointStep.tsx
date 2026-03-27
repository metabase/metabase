/* eslint-disable metabase/no-unconditional-metabase-links-render, metabase/no-literal-metabase-strings, i18next/no-literal-string -- admin-only page */

import { c, t } from "ttag";

import expressSnippet from "docs/embedding/sdk/snippets/authentication/express-server-interactive-and-sdk";
import { CodeEditor } from "metabase/common/components/CodeEditor";
import { CopyButton } from "metabase/common/components/CopyButton";
import { useDocsUrl, useSetting } from "metabase/common/hooks";
import {
  Anchor,
  Box,
  Button,
  Code,
  Group,
  Stack,
  Text,
  TextInput,
} from "metabase/ui";

import S from "./SetupSsoPage.module.css";

export const AddEndpointStep = ({ onDone }: { onDone: () => void }) => {
  const jwtSharedSecret = useSetting("jwt-shared-secret");
  const { url: jwtDocsUrl } = useDocsUrl("embedding/authentication");

  return (
    <Stack gap="lg">
      <TextInput
        label={t`JWT Signing Key`}
        description={t`This secret is used to sign JWT tokens. Replace YOUR_SECRET_HERE in the below snippet with this value.`}
        value={jwtSharedSecret ?? ""}
        readOnly
        rightSection={<CopyButton value={jwtSharedSecret ?? ""} />}
        rightSectionWidth={40}
      />

      <Stack gap="sm">
        <Text>{t`You'll need to add a library to your backend to sign your JSON Web Tokens.`}</Text>
        <Text>{t`For Node.js, we recommend jsonwebtoken:`}</Text>

        <Code className={S.codeSnippet} p="md" block>
          npm install jsonwebtoken --save
        </Code>

        <Text>
          {c("{0} is '/sso/metabase'")
            .jt`Next, set up an endpoint on your backend (e.g., ${(
            <Code key="endpoint">/sso/metabase</Code>
          )}) that uses your Metabase JWT shared secret to generate a JWT for the authenticated user. `}
          <strong>
            {c("{0} is 'jwt'")
              .jt`This endpoint must return a JSON object with a ${(
              <Code key="jwt-prop">jwt</Code>
            )} property containing the signed JWT.`}
          </strong>
          {c('{0} is \'{ "jwt": "your-signed-jwt" }\'').jt` For example: ${(
            <Code key="example">{'{ "jwt": "your-signed-jwt" }'}</Code>
          )}.`}
        </Text>
        <Text>{t`This example code for Node.js sets up an endpoint using Express:`}</Text>
      </Stack>

      <Box pos="relative">
        <CopyButton
          className={S.codeSnippetCopyButton}
          value={expressSnippet}
        />

        <CodeEditor
          className={S.codeSnippet}
          language="typescript"
          value={expressSnippet}
          readOnly
          lineNumbers={false}
        />
      </Box>

      <Text size="sm" c="text-secondary">
        {c("{0} is a link labeled 'docs'")
          .jt`You can view more examples in the ${(
          <Anchor key="docs-link" href={jwtDocsUrl} target="_blank">
            {c("In the sentence 'You can view more examples in the docs'")
              .t`docs`}
          </Anchor>
        )}.`}
      </Text>

      <Group justify="flex-end">
        <Button variant="filled" onClick={onDone}>
          {t`Next`}
        </Button>
      </Group>
    </Stack>
  );
};
