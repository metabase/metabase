import { useKBar } from "kbar";
import { t } from "ttag";

import { METAKEY } from "metabase/lib/browser";
import {
  Drawer,
  Group,
  Kbd,
  type ModalProps,
  Stack,
  Text,
  Title,
} from "metabase/ui";

export const PaletteShortcutsModal = ({
  onClose,
  open,
}: {
  onClose: ModalProps["onClose"];
  open: boolean;
}) => {
  const { actions } = useKBar(state => ({ actions: state.actions }));

  const shortcutActions = Object.values(actions).filter(
    action => action.shortcut,
  );

  return (
    <Drawer
      opened={open}
      onClose={onClose}
      position="right"
      title={<Title>{t`Shortcuts`}</Title>}
    >
      <Stack>
        {shortcutActions.map(action => (
          <Group key={action.id} justify="space-between">
            <Text>{action.name}</Text>
            <Shortcut shortcut={action.shortcut?.join("")} />
          </Group>
        ))}
      </Stack>
    </Drawer>
  );
};

const Shortcut = (props: { shortcut: string }) => {
  const keys = props.shortcut.replace("$mod", METAKEY).split?.("+") || [];

  return (
    <Group gap="0.5rem">
      {keys.map(key => (
        <Kbd key={key}>{key}</Kbd>
      ))}
    </Group>
  );
};
