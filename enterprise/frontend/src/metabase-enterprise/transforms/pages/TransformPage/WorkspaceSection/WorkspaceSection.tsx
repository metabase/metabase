import { useEffect, useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Button, Card, Group, Icon, Text } from "metabase/ui";
import {
  useCreateWorkspaceMutation,
  useGetWorkspaceContentsQuery,
} from "metabase-enterprise/api";
import type { Transform } from "metabase-types/api";

import { TitleSection } from "../../../components/TitleSection";

type WorkspaceSectionProps = {
  transform: Transform;
};

export function WorkspaceSection({ transform }: WorkspaceSectionProps) {
  const dispatch = useDispatch();
  const hasWorkspace = transform.workspace_id != null;
  const [createWorkspace, { isLoading }] = useCreateWorkspaceMutation();
  const { sendErrorToast } = useMetadataToasts();
  const [workspaceId, setWorkspaceId] = useState<number | null>(null);

  const { data: workspaceContents } = useGetWorkspaceContentsQuery(
    workspaceId ?? 0,
    {
      skip: workspaceId == null,
    },
  );

  useEffect(() => {
    if (
      workspaceContents &&
      workspaceContents.contents.transforms.length === 1
    ) {
      const newTransformId = workspaceContents.contents.transforms[0];
      dispatch(push(Urls.transform(newTransformId)));
    }
  }, [workspaceContents, dispatch]);

  const handleCheckoutClick = async () => {
    try {
      const result = await createWorkspace({
        name: `${transform.name} workspace`,
        stuffs: {
          transforms: [transform.id],
        },
      }).unwrap();

      setWorkspaceId(result.id);
    } catch (error) {
      sendErrorToast(t`Failed to create workspace`);
    }
  };

  return (
    <TitleSection label={t`Workspace`}>
      <Card p="md" shadow="none" withBorder>
        {hasWorkspace ? (
          <Group>
            <Icon name="folder" aria-hidden />
            <Text>
              {t`This is part of Workspace ${transform.workspace_id}`}
            </Text>
          </Group>
        ) : (
          <Group>
            <Icon name="folder" aria-hidden />
            <Text c="text-secondary">
              {t`This transform is not part of any workspace`}
            </Text>
            <Button
              leftSection={<Icon name="add" aria-hidden />}
              onClick={handleCheckoutClick}
              loading={isLoading}
            >
              {t`Check this out in a new workspace`}
            </Button>
          </Group>
        )}
      </Card>
    </TitleSection>
  );
}
