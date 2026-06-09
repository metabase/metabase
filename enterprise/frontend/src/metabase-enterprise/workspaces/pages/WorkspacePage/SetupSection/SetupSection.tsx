import { useDisclosure } from "@mantine/hooks";
import { jt, t } from "ttag";

import { TitleSection } from "metabase/data-studio/common/components/TitleSection";
import {
  Anchor,
  Button,
  Divider,
  FixedSizeIcon,
  Group,
  Text,
  Tooltip,
} from "metabase/ui";
import { useListWorkspaceInstancesQuery } from "metabase-enterprise/api";
import type { Workspace, WorkspaceInstance } from "metabase-types/api";

import { trackWorkspaceConfigDownloaded } from "../../../analytics";

import { ResetInstanceModal } from "./ResetInstanceModal";
import { SetupInstanceModal } from "./SetupInstanceModal";

const CONFIG_FILENAME = "config.yml";

export type SetupSectionProps = {
  workspace: Workspace;
};

export function SetupSection({ workspace }: SetupSectionProps) {
  const { data: instances = [] } = useListWorkspaceInstancesQuery();

  // The bound instance is the pool instance whose `workspace_id` points back here.
  const instance =
    instances.find((instance) => instance.workspace_id === workspace.id) ??
    null;

  const configLink = (
    <Anchor
      key="config"
      href={`/api/ee/workspace-manager/${workspace.id}/config`}
      download={CONFIG_FILENAME}
      onClick={() =>
        trackWorkspaceConfigDownloaded({ workspaceId: workspace.id })
      }
    >
      {CONFIG_FILENAME}
    </Anchor>
  );

  // eslint-disable-next-line metabase/no-literal-metabase-strings -- referring to the product name is intentional
  const description = jt`Run a Metabase instance backed by this workspace's data so you can make changes safely. Or, instead, you can download the ${configLink} file to set up an instance manually.`;

  return (
    <TitleSection
      data-testid="workspace-setup-section"
      label={t`Set up a development instance`}
    >
      <Group p="lg" justify="space-between" align="center">
        <Text maw="40rem">{description}</Text>
        <DeploymentButton
          workspace={workspace}
          instance={instance}
          instances={instances}
        />
      </Group>
      {instance != null && (
        <>
          <Divider />
          <Group p="lg">
            <Anchor href={instance.url} target="_blank" rel="noreferrer">
              <Group gap="xs" align="center" wrap="nowrap">
                {t`Open the instance`}
                <FixedSizeIcon name="external" aria-hidden />
              </Group>
            </Anchor>
          </Group>
        </>
      )}
    </TitleSection>
  );
}

type DeploymentButtonProps = {
  workspace: Workspace;
  instance: WorkspaceInstance | null;
  instances: WorkspaceInstance[];
};

function DeploymentButton({
  workspace,
  instance,
  instances,
}: DeploymentButtonProps) {
  const [setupOpened, { open: openSetup, close: closeSetup }] =
    useDisclosure(false);
  const [resetOpened, { open: openReset, close: closeReset }] =
    useDisclosure(false);

  if (instance != null) {
    return (
      <>
        <Button onClick={openReset}>{t`Reset the instance`}</Button>
        <ResetInstanceModal
          workspace={workspace}
          instance={instance}
          opened={resetOpened}
          onClose={closeReset}
        />
      </>
    );
  }

  const hasFreeInstance = instances.some(
    (instance) => instance.workspace_id == null,
  );

  if (!hasFreeInstance) {
    return (
      <Tooltip label={t`Register a development instance first.`}>
        <Button variant="filled" disabled>
          {t`Set up an instance`}
        </Button>
      </Tooltip>
    );
  }

  return (
    <>
      <Button variant="filled" onClick={openSetup}>
        {t`Set up an instance`}
      </Button>
      <SetupInstanceModal
        workspace={workspace}
        instances={instances}
        opened={setupOpened}
        onClose={closeSetup}
      />
    </>
  );
}
