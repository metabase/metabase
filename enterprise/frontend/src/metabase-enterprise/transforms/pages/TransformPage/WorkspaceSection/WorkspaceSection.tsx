import { push } from "react-router-redux";
import { t } from "ttag";

import { skipToken } from "metabase/api";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Anchor, Button, Card, Group, Icon, Stack, Text } from "metabase/ui";
import {
  useCreateWorkspaceMutation,
  useGetTransformDownstreamMappingQuery,
  useGetTransformUpstreamMappingQuery,
  useGetWorkspaceQuery,
  useMergeWorkspaceMutation,
} from "metabase-enterprise/api";
import type { Transform } from "metabase-types/api";

import { TitleSection } from "../../../components/TitleSection";

type WorkspaceSectionProps = {
  transform: Transform;
};

export function WorkspaceSection({ transform }: WorkspaceSectionProps) {
  const dispatch = useDispatch();
  const hasWorkspace = transform.workspace_id != null;
  const [createWorkspace, { isLoading: isCreating }] =
    useCreateWorkspaceMutation();
  const [mergeWorkspace, { isLoading: isMerging }] =
    useMergeWorkspaceMutation();
  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();

  const { data: workspace } = useGetWorkspaceQuery(
    transform.workspace_id == null ? skipToken : transform.workspace_id,
  );

  const { data: upstreamMapping, isLoading: isLoadingUpstream } =
    useGetTransformUpstreamMappingQuery(
      hasWorkspace ? transform.id : skipToken,
    );

  const { data: downstreamMapping, isLoading: isLoadingDownstream } =
    useGetTransformDownstreamMappingQuery(
      hasWorkspace ? skipToken : transform.id,
    );

  const isLoadingMappings = isLoadingUpstream || isLoadingDownstream;

  const handleCheckoutClick = async () => {
    try {
      const workspace = await createWorkspace({
        name: `${transform.name} workspace`,
        upstream: {
          transforms: [transform.id],
        },
      }).unwrap();

      const transforms = workspace.contents?.transforms;

      if (transforms && transforms.length === 1) {
        const newTransformId = transforms[0].id;
        dispatch(push(Urls.transform(newTransformId)));
      }
    } catch (error) {
      sendErrorToast(t`Failed to create workspace`);
    }
  };

  const handleMergeClick = async () => {
    if (!transform.workspace_id || !upstreamMapping?.transform) {
      return;
    }

    try {
      const result = await mergeWorkspace(transform.workspace_id).unwrap();

      if (result.errors && result.errors.length > 0) {
        sendErrorToast(t`Some transforms failed to merge`);
      } else {
        sendSuccessToast(t`Successfully merged workspace`);
        dispatch(push(Urls.transform(upstreamMapping.transform.id)));
      }
    } catch (error) {
      sendErrorToast(t`Failed to merge workspace`);
    }
  };

  return (
    <TitleSection label={t`Workspace`}>
      <Card p="md" shadow="none" withBorder>
        {hasWorkspace ? (
          <Stack gap="sm">
            <Group>
              <Icon name="folder" aria-hidden />
              <Text>
                {t`This is part of`}{" "}
                <Anchor href={Urls.workspace(transform.workspace_id!)}>
                  {workspace?.name ?? t`Workspace ${transform.workspace_id}`}
                </Anchor>
              </Text>
            </Group>
            {!isLoadingMappings && upstreamMapping?.transform != null && (
              <Group>
                <Icon name="arrow_left" aria-hidden />
                <Text>
                  {t`Live version:`}{" "}
                  <Anchor href={Urls.transform(upstreamMapping.transform.id)}>
                    {upstreamMapping.transform.name}
                  </Anchor>
                </Text>
              </Group>
            )}
            <Button
              leftSection={<Icon name="upload" aria-hidden />}
              onClick={handleMergeClick}
              loading={isMerging}
              disabled={!upstreamMapping?.transform}
            >
              {t`Merge`}
            </Button>
          </Stack>
        ) : (
          <Stack gap="sm">
            <Group>
              <Icon name="folder" aria-hidden />
              <Text c="text-secondary">
                {t`This transform is not part of any workspace`}
              </Text>
              <Button
                leftSection={<Icon name="add" aria-hidden />}
                onClick={handleCheckoutClick}
                loading={isCreating}
                disabled={!transform.table}
              >
                {t`Check this out in a new workspace`}
              </Button>
            </Group>
            {!isLoadingMappings &&
              downstreamMapping &&
              downstreamMapping.transforms.length > 0 && (
                <Stack gap="xs">
                  <Group>
                    <Icon name="arrow_right" aria-hidden />
                    <Text>{t`It is checked out as part of the following workspaces:`}</Text>
                  </Group>
                  {downstreamMapping.transforms.map((item) => (
                    <Group key={item.id} ml="xl" gap="xs">
                      <Text c="text-secondary">•</Text>
                      <Anchor href={Urls.transform(item.id)}>
                        {item.workspace.name}
                      </Anchor>
                    </Group>
                  ))}
                </Stack>
              )}
          </Stack>
        )}
      </Card>
    </TitleSection>
  );
}
