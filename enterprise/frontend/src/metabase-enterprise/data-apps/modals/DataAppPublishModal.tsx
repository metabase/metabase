import { t } from "ttag";

import { PublicLinkCopyPanel } from "metabase/embedding/components/PublicLinkPopover/PublicLinkCopyPanel";
import * as Urls from "metabase/lib/urls";
import { Anchor, Group, Icon, Modal, Stack, Text } from "metabase/ui";

import type { DataApp } from "../types";

interface DataAppPublishModalProps {
  dataApp: DataApp;
  opened: boolean;
  onClose: () => void;
}

export const DataAppPublishModal = ({
  dataApp,
  opened,
  onClose,
}: DataAppPublishModalProps) => {
  const fullAppUrl = Urls.publishedDataApp(dataApp.url);

  return (
    <Modal opened={opened} onClose={onClose}>
      <Stack>
        <Text>{t`Share a link to use your app.`}</Text>

        <PublicLinkCopyPanel url={fullAppUrl} />

        <Anchor fw="bold" target="_blank" href={fullAppUrl}>
          <Group display="inline-flex" align="center" gap="xs">
            {t`View app`}
            <Icon name="share" />
          </Group>
        </Anchor>
      </Stack>
    </Modal>
  );
};
