import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { ActionIcon, Icon, Menu } from "metabase/ui";

import type { SwitchAdvancedMode } from "../../types";

import { DisableAdvancedModal } from "./DisableAdvancedModal";

type Props = {
  loading: boolean;
  onConfirm: SwitchAdvancedMode;
};

export function GearIconMenu({ loading, onConfirm }: Props) {
  const [showDisableModal, { toggle: toggleShowDisableModal }] =
    useDisclosure(false);

  return (
    <>
      <Menu position="bottom-end">
        <Menu.Target>
          <ActionIcon
            aria-label={t`Settings`}
            bd="1px solid var(--mb-color-border-neutral)"
            c="text-primary"
            size="lg"
            variant="outline"
          >
            <Icon name="gear" />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item onClick={toggleShowDisableModal}>
            {t`Remove group-level access`}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      {showDisableModal && (
        <DisableAdvancedModal
          loading={loading}
          onConfirm={onConfirm}
          onClose={toggleShowDisableModal}
        />
      )}
    </>
  );
}
