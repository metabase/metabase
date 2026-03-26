/* eslint-disable metabase/no-unconditional-metabase-links-render */

import { jt, t } from "ttag";

import { useDocsUrl } from "metabase/common/hooks";
import { Anchor, Button, Group, Stack, Text } from "metabase/ui";

import S from "./SetupSsoPage.module.css";

export const AddEndpointStep = ({ onDone }: { onDone: () => void }) => {
  // TODO(EMB-1337): replace this with standalone JWT backend docs page.
  const { url: jwtDocsUrl } = useDocsUrl("embedding/authentication");

  const jwtDocsIframeUrl = `${jwtDocsUrl}?hide_nav=true&no_gdpr=true`;

  return (
    <Stack gap="lg">
      <iframe
        src={jwtDocsIframeUrl}
        title={t`JWT Authentication Documentation`}
        className={S.docsIframe}
      />

      <Text size="sm" c="text-secondary">
        {jt`You can view more examples in the ${(
          <Anchor key="docs-link" href={jwtDocsUrl} target="_blank">
            {t`docs`}
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
