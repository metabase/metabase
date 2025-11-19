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
  useGetWorkspaceQuery,
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
  const [createdWorkspaceId, setCreatedWorkspaceId] = useState<number | null>(
    null,
  );

  const { data: workspace } = useGetWorkspaceQuery(
    transform.workspace_id ?? 0,
    {
      skip: transform.workspace_id == null,
    },
  );

  const { data: workspaceContents } = useGetWorkspaceContentsQuery(
    createdWorkspaceId ?? 0,
    {
      skip: createdWorkspaceId == null,
    },
  );

  useEffect(() => {
    if (
      workspaceContents &&
      workspaceContents.contents.transforms.length === 1
    ) {
      const newTransformId = workspaceContents.contents.transforms[0].id;
      dispatch(push(Urls.transform(newTransformId)));
    }
  }, [workspaceContents, dispatch]);

  const handleCheckoutClick = async () => {
    try {
      const result = await createWorkspace({
        name: `${transform.name} workspace`,
        upstream: {
          transforms: [transform.id],
        },
      }).unwrap();

      setCreatedWorkspaceId(result.id);
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
              {workspace
                ? t`This is part of ${workspace.name} (${transform.workspace_id})`
                : t`This is part of Workspace ${transform.workspace_id}`}
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
