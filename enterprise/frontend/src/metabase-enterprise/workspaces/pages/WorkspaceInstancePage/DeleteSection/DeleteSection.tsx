import { push } from "react-router-redux";
import { jt, t } from "ttag";

import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import { TitleSection } from "metabase/data-studio/common/components/TitleSection";
import { useDispatch } from "metabase/redux";
import { Button, Code, Group, Text } from "metabase/ui";
import * as Urls from "metabase/urls";
import { useDeleteWorkspaceInstanceMutation } from "metabase-enterprise/api";

const CONFIG_FILENAME = "config.yml";

export function DeleteSection() {
  const dispatch = useDispatch();
  const { modalContent, show } = useConfirmation();
  const [deleteInstance] = useDeleteWorkspaceInstanceMutation();

  const handleClick = () => {
    show({
      title: t`Exit workspace mode?`,
      message: jt`This instance will stop remapping table reads and writes to the workspace's isolated schemas. The databases registered from the uploaded ${(
        <Code key="config">{CONFIG_FILENAME}</Code>
      )} will remain — you can re-enter workspace mode at any time by uploading it again.`,
      confirmButtonText: t`Exit workspace mode`,
      confirmButtonProps: { color: "danger" },
      onConfirm: async () => {
        await deleteInstance().unwrap();
        dispatch(push(Urls.workspaceList()));
      },
    });
  };

  return (
    <>
      <TitleSection
        data-testid="workspace-instance-delete-section"
        label={t`Exit workspace mode`}
      >
        <Group p="lg" justify="space-between" align="center">
          <Text maw="40rem">
            {t`Stop remapping table reads and writes on this instance and return to the workspace list.`}
          </Text>
          <Button color="error" variant="filled" onClick={handleClick}>
            {t`Exit workspace mode`}
          </Button>
        </Group>
      </TitleSection>
      {modalContent}
    </>
  );
}
