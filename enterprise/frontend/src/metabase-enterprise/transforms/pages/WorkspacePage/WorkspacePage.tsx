import { useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { PLUGIN_METABOT } from "metabase/plugins";
import {
  Box,
  Button,
  Group,
  Icon,
  Stack,
  Tabs,
  Text,
  Title,
} from "metabase/ui";
import {
  useArchiveWorkspaceMutation,
  useGetWorkspaceQuery,
  useListTransformsQuery,
} from "metabase-enterprise/api";
import type {
  DraftTransformSource,
  Transform,
  WorkspaceContentItem,
} from "metabase-types/api";

import { MetabotTab } from "./MetabotTab";
import { TransformEditor } from "./TransformEditor";
import styles from "./WorkspacePage.module.css";

type WorkspacePageProps = {
  params: {
    workspaceId: string;
  };
};

export function WorkspacePage({ params }: WorkspacePageProps) {
  const id = Number(params.workspaceId);
  const isMetabotAvailable = PLUGIN_METABOT.isEnabled();
  const dispatch = useDispatch();
  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();
  const [archiveWorkspace, { isLoading: isArchiving }] =
    useArchiveWorkspaceMutation();
  const [tab, setTab] = useState<string>("setup");

  const { data: transforms = [] } = useListTransformsQuery({});
  const { data: workspace, isLoading: isLoadingWorkspace } =
    useGetWorkspaceQuery(id);

  const handleArchiveClick = async () => {
    try {
      await archiveWorkspace(id).unwrap();
      sendSuccessToast(t`Workspace archived successfully`);
      dispatch(push(Urls.workspaceList()));
    } catch (error) {
      sendErrorToast(t`Failed to archive workspace`);
    }
  };

  const workspaceTransforms = (workspace as any)?.contents?.transforms ?? [];
  const [activeTransform, setActiveTransform] = useState<
    Transform | undefined
  >();

  if (isLoadingWorkspace) {
    return (
      <Box p="lg">
        <Text>{t`Loading...`}</Text>
      </Box>
    );
  }

  if (!workspace) {
    return (
      <Box p="lg">
        <Text c="text-dark">{t`Workspace not found`}</Text>
      </Box>
    );
  }

  return (
    <Stack h="100%" gap={0}>
      <Group
        px="lg"
        py="md"
        style={{ borderBottom: "1px solid var(--mb-color-border)" }}
        justify="space-between"
      >
        <Title order={2}>{workspace.name}</Title>
        <Button
          leftSection={<Icon name="archive" aria-hidden />}
          onClick={handleArchiveClick}
          loading={isArchiving}
          variant="subtle"
          c="text-dark"
        >
          {t`Archive workspace`}
        </Button>
      </Group>
      <Group align="flex-start" gap={0} flex="1 1 auto">
        <Box
          w="70%"
          h="100%"
          style={{ borderRight: "1px solid var(--mb-color-border)" }}
          pos="relative"
        >
          <Tabs
            defaultValue="setup"
            display="flex"
            h="100%"
            style={{ flexDirection: "column" }}
            value={tab}
            onChange={(tab) => {
              if (tab) {
                setTab(tab);
              }
            }}
          >
            <Box
              flex="0 0 auto"
              px="md"
              style={{ borderBottom: "1px solid var(--mb-color-border)" }}
            >
              <Tabs.List className={styles.tabsPanel}>
                <Tabs.Tab value="setup">{t`Setup`}</Tabs.Tab>
                {isMetabotAvailable && (
                  <Tabs.Tab value="metabot">{t`Metabot`}</Tabs.Tab>
                )}
                <Tabs.Tab value="transform">{t`Transform`}</Tabs.Tab>
              </Tabs.List>
            </Box>

            <Box flex={1} mih={0}>
              {isMetabotAvailable && (
                <Tabs.Panel value="metabot" h="100%">
                  <MetabotTab />
                </Tabs.Panel>
              )}

              <Tabs.Panel value="transform" h="100%">
                {activeTransform ? (
                  <TransformEditor
                    source={activeTransform.source as DraftTransformSource}
                  />
                ) : (
                  <Text c="text-medium">
                    {t`Select a transform on the right.`}
                  </Text>
                )}
              </Tabs.Panel>
            </Box>
          </Tabs>
        </Box>
        <Box style={{ flex: 1 }}>
          <Tabs defaultValue="code">
            <Box
              px="md"
              style={{ borderBottom: "1px solid var(--mb-color-border)" }}
            >
              <Tabs.List>
                <Tabs.Tab value="code">{t`Code`}</Tabs.Tab>
              </Tabs.List>
            </Box>
            <Tabs.Panel value="code" p="md">
              <Stack h="100%">
                {workspaceTransforms.length === 0 ? null : (
                  <Stack
                    gap="md"
                    style={{
                      borderBottom: "1px solid var(--mb-color-border)",
                    }}
                  >
                    <Stack gap={0}>
                      <Text fw={600}>{t`Workspace Transforms`}</Text>
                      {workspaceTransforms.map(
                        (transform: WorkspaceContentItem) => (
                          <Group
                            justify="flex-start"
                            align="center"
                            key={transform.id}
                            gap="sm"
                          >
                            <Icon name="sun" size={12} />
                            <Text
                              style={{ cursor: "pointer" }}
                              variant="inline"
                              onClick={() => {
                                setTab("transform");
                                setActiveTransform(transform as Transform);
                              }}
                              c={
                                activeTransform?.id === transform.id
                                  ? "var(--mb-color-primary)"
                                  : "text-dark"
                              }
                            >
                              {transform.name}
                            </Text>
                          </Group>
                        ),
                      )}
                    </Stack>
                  </Stack>
                )}
                <Stack py="md" dir="column" gap="sm">
                  {transforms.map((transform: WorkspaceContentItem) => (
                    <Group
                      justify="flex-start"
                      align="center"
                      key={transform.id}
                      gap="sm"
                    >
                      <Icon name="sun" size={12} />
                      <Text
                        style={{
                          cursor: "pointer",
                          color: "var(--mb-color-primary)",
                        }}
                        variant="subtle"
                        onClick={() => {
                          setTab("transform");
                          setActiveTransform(transform as Transform);
                        }}
                        c={
                          activeTransform?.id === transform.id
                            ? "var(--mb-color-brand)"
                            : "text-dark"
                        }
                      >
                        {transform.name}
                      </Text>
                    </Group>
                  ))}
                </Stack>
              </Stack>
            </Tabs.Panel>
          </Tabs>
        </Box>
      </Group>
    </Stack>
  );
}
