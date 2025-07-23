import { t } from "ttag";

import { useAdminSetting } from "metabase/api/utils";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Modal } from "metabase/ui";

import { SlackSetup } from "./SlackSetup";
import { SlackStatus } from "./SlackStatus";

export const SlackSettingsModal = ({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) => {
  const { value: isApp, isLoading } = useAdminSetting("slack-app-token");

  return (
    <Modal
      opened={isOpen}
      title={t`Metabase on Slack`}
      onClose={onClose}
      padding="xl"
    >
      <LoadingAndErrorWrapper loading={isLoading}>
        {isApp ? <SlackStatus /> : <SlackSetup />}
      </LoadingAndErrorWrapper>
    </Modal>
  );
};
