import { useCallback } from "react";
import { t } from "ttag";

import type { DataApp } from "metabase/data-apps/types";
import { PublicLinkCopyPanel } from "metabase/embedding/components/PublicLinkPopover/PublicLinkCopyPanel";
import * as Urls from "metabase/lib/urls";
import { Anchor, Button, Group, Icon, Modal, Stack, Text } from "metabase/ui";
import {
  useReleaseDataAppDefinitionMutation,
  useUpdateDataAppDefinitionMutation,
} from "metabase-enterprise/api";

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
  const [updateDataAppDefinition] = useUpdateDataAppDefinitionMutation();
  const [releaseDataAppDefinition] = useReleaseDataAppDefinitionMutation();

  const fullAppUrl = Urls.publishedDataApp(dataApp.slug);

  const needsToPublish =
    dataApp.status === "private" || dataApp.status === "archived";

  const handlePublish = useCallback(async () => {
    await updateDataAppDefinition({
      id: dataApp.id,
      config: {
        actions: [],
        pages: [],
        parameters: [],
      },
    });

    await releaseDataAppDefinition({
      id: dataApp.id,
    });
  }, [dataApp.id, releaseDataAppDefinition, updateDataAppDefinition]);

  return (
    <Modal opened={opened} onClose={onClose}>
      {needsToPublish ? (
        <Stack>
          <Text>{t`Are you ready to publish this app?`}</Text>

          <Button onClick={handlePublish}>{t`Publish`}</Button>
        </Stack>
      ) : (
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
      )}
    </Modal>
  );
};
