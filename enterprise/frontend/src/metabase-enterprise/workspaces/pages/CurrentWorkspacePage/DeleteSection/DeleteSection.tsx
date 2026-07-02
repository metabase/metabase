import { jt, t } from "ttag";

import { TitleSection } from "metabase/common/data-studio/components/TitleSection";
import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import { Button, Code, Group, Text } from "metabase/ui";
import { useDeleteCurrentWorkspaceMutation } from "metabase-enterprise/api";

import { trackWorkspaceInstanceLeave } from "../../../analytics";

const CONFIG_FILENAME = "config.yml";

export function DeleteSection() {
  const { modalContent, show } = useConfirmation();
  const [deleteInstance] = useDeleteCurrentWorkspaceMutation();

  const handleClick = () => {
    show({
      title: t`Leave workspace?`,
      message: jt`This instance will stop remapping transform tables to the workspace's isolated schemas. The databases registered from the uploaded ${(
        <Code key="config">{CONFIG_FILENAME}</Code>
      )} will remain — you can re-enter the workspace at any time by uploading it again.`,
      confirmButtonText: t`Leave workspace`,
      confirmButtonProps: { color: "danger" },
      onConfirm: async () => {
        await deleteInstance().unwrap();
        trackWorkspaceInstanceLeave();
      },
    });
  };

  return (
    <>
      <TitleSection
        data-testid="workspace-instance-delete-section"
        label={t`Leave workspace`}
      >
        <Group p="lg" justify="space-between" align="center">
          <Text maw="40rem">
            {t`Stop remapping transform tables on this instance.`}
          </Text>
          <Button color="error" variant="filled" onClick={handleClick}>
            {t`Leave workspace`}
          </Button>
        </Group>
      </TitleSection>
      {modalContent}
    </>
  );
}
