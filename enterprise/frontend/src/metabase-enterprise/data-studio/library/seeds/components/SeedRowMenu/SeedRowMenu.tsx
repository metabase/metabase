import { useState } from "react";
import { t } from "ttag";

import type { SeedData } from "metabase/data-studio/common/types";
import { ActionIcon, Icon, Menu } from "metabase/ui";

import { DeleteSeedModal } from "../DeleteSeedModal";
import { ReplaceSeedModal } from "../ReplaceSeedModal";

type SeedModalType = "replace" | "delete";

export function SeedRowMenu({
  seed,
  onDeleted,
}: {
  seed: SeedData;
  onDeleted?: () => void;
}) {
  const [modal, setModal] = useState<SeedModalType>();

  return (
    <>
      <Menu position="bottom-end">
        <Menu.Target>
          <ActionIcon
            onClick={(e) => e.stopPropagation()}
            aria-label={t`Seed actions`}
          >
            <Icon name="ellipsis" />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            leftSection={<Icon name="refresh" />}
            onClick={(e) => {
              e.stopPropagation();
              setModal("replace");
            }}
          >
            {t`Replace CSV…`}
          </Menu.Item>
          <Menu.Item
            leftSection={<Icon name="download" />}
            component="a"
            href={`/api/ee/data-studio/seed/${seed.id}/csv`}
            onClick={(e) => e.stopPropagation()}
          >
            {t`Download CSV`}
          </Menu.Item>
          <Menu.Divider />
          <Menu.Item
            c="error"
            leftSection={<Icon name="trash" />}
            onClick={(e) => {
              e.stopPropagation();
              setModal("delete");
            }}
          >
            {t`Delete…`}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      <ReplaceSeedModal
        seed={seed}
        opened={modal === "replace"}
        onClose={() => setModal(undefined)}
      />
      <DeleteSeedModal
        seed={seed}
        opened={modal === "delete"}
        onClose={() => setModal(undefined)}
        onDeleted={onDeleted}
      />
    </>
  );
}
