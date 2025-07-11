import { useCallback, useState } from "react";
import { t } from "ttag";

import type { DataApp } from "metabase/data-apps/types";
import { PublicLinkCopyPanel } from "metabase/embedding/components/PublicLinkPopover/PublicLinkCopyPanel";
import * as Urls from "metabase/lib/urls";
import {
  Anchor,
  Button,
  Group,
  Icon,
  Modal,
  Stack,
  Text,
  TextInput,
} from "metabase/ui";
import {
  useArchiveDataAppMutation,
  useReleaseDataAppDefinitionMutation,
  useUpdateDataAppDefinitionMutation,
  useUpdateDataAppMutation,
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
  const fullAppUrl = Urls.publishedDataApp(dataApp.slug);

  const [archiveDataApp] = useArchiveDataAppMutation();

  const needsToPublish =
    dataApp.status === "private" || dataApp.status === "archived";

  const handleArchive = useCallback(async () => {
    await archiveDataApp({ id: dataApp.id });
  }, [archiveDataApp, dataApp.id]);

  return (
    <Modal opened={opened} onClose={onClose}>
      {needsToPublish ? (
        <DataAppFirstPublishContent dataApp={dataApp} />
      ) : (
        <Stack>
          <Text>{t`Share a link to use your app.`}</Text>

          <PublicLinkCopyPanel url={fullAppUrl} />

          <Group justify="space-between" align="center">
            <Anchor fw="bold" target="_blank" href={fullAppUrl}>
              <Group display="inline-flex" align="center" gap="xs">
                {t`View app`}
                <Icon name="share" />
              </Group>
            </Anchor>

            {dataApp.status !== "archived" && (
              <Button
                color="danger"
                variant="subtle"
                onClick={handleArchive}
              >{t`Archive`}</Button>
            )}
          </Group>
        </Stack>
      )}
    </Modal>
  );
};

const DataAppFirstPublishContent = ({ dataApp }: { dataApp: DataApp }) => {
  const [urlSlug, setUrlSlug] = useState(dataApp.slug);

  const [updateDataApp] = useUpdateDataAppMutation();
  const [updateDataAppDefinition] = useUpdateDataAppDefinitionMutation();
  const [releaseDataAppDefinition] = useReleaseDataAppDefinitionMutation();

  const handlePublish = useCallback(async () => {
    await Promise.all([
      updateDataApp({
        id: dataApp.id,
        slug: urlSlug,
      }),

      updateDataAppDefinition({
        id: dataApp.id,
        config: {
          actions: [],
          pages: [],
          parameters: [],
        },
      }),
    ]);

    await releaseDataAppDefinition({
      id: dataApp.id,
    });
  }, [
    dataApp.id,
    releaseDataAppDefinition,
    updateDataApp,
    updateDataAppDefinition,
    urlSlug,
  ]);

  return (
    <Stack>
      <Text>{t`Are you ready to publish this app?`}</Text>

      <TextInput
        label={t`Url slug`}
        value={urlSlug}
        required
        onChange={(e) => setUrlSlug(e.target.value)}
      />

      <Button disabled={!urlSlug} onClick={handlePublish}>{t`Publish`}</Button>
    </Stack>
  );
};
