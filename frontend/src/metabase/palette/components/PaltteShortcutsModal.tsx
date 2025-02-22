import { Kbd } from "@mantine/core";
import { useKBar } from "kbar";
import { Modal, type ModalProps, Text } from "metabase/ui";

export const PaletteShortcutsModal = (props: {
  onClose: ModalProps["onClose"];
}) => {
  const { actions } = useKBar(state => ({ actions: state.actions }));

  const shortcutActions = Object.values(actions).filter(
    action => action.shortcut,
  );

  console.log(shortcutActions);

  return (
    <Modal opened title="Palette Shortcuts" {...props}>
      {shortcutActions.map(action => (
        <Text>
          {action.name}{" "}
          {action.shortcut.map(shortcut => (
            <Kbd>{shortcut}</Kbd>
          ))}
        </Text>
      ))}
    </Modal>
  );
};
