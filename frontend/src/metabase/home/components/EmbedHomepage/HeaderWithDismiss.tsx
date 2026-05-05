import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { Group, Menu, Text } from "metabase/ui";
import type { EmbeddingHomepageDismissReason } from "metabase-types/api";

type HeaderWithDismissProps = {
  onDismiss: (reason: EmbeddingHomepageDismissReason) => void;
};

export const HeaderWithDismiss = ({ onDismiss }: HeaderWithDismissProps) => {
  return (
    <Group gap="space-between">
      <Text
        fw="bold"
        // eslint-disable-next-line metabase/no-literal-metabase-strings -- This string only shows for admins.
      >{t`Get started with Embedding Metabase in your app`}</Text>
      <Menu trigger="hover" closeDelay={200}>
        <Menu.Target>
          <Text
            fw="bold"
            c="brand"
            className={CS.cursorDefault}
          >{t`Hide these`}</Text>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            onClick={() => onDismiss("dismissed-done")}
          >{t`Embedding done, all good`}</Menu.Item>
          <Menu.Item
            onClick={() => onDismiss("dismissed-run-into-issues")}
          >{t`I ran into issues`}</Menu.Item>
          <Menu.Item
            onClick={() => onDismiss("dismissed-not-interested-now")}
          >{t`I'm not interested right now`}</Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </Group>
  );
};
