import { useKBar } from "kbar";
import { t } from "ttag";
import _ from "underscore";

import { METAKEY } from "metabase/lib/browser";
import { shortcuts } from "metabase/palette/shortcuts";
import {
  Group,
  Kbd,
  Modal,
  type ModalProps,
  ScrollArea,
  Tabs,
  Text,
} from "metabase/ui";

// import S from "./PaletteShortcutsModal.module.css";

export const GROUP_LABLES = {
  global: `General`,
  dashboard: "Dashboard",
  question: "Querying & the notebook",
};

const groupedShortcuts = _.groupBy(
  _.mapObject(shortcuts, (val, id) => ({ id, ...val })),
  "shortcutGroup",
);
const shortcutGroups = Object.keys(groupedShortcuts);

export const PaletteShortcutsModal = ({
  onClose,
  open,
}: {
  onClose: ModalProps["onClose"];
  open: boolean;
}) => {
  const { actions } = useKBar(state => ({ actions: state.actions }));

  return (
    <Modal
      opened={open}
      onClose={onClose}
      title={t`Shortcuts`}
      withCloseButton={false}
      size="xl"
      styles={{
        content: {
          height: "564px",
          display: "flex",
          flexDirection: "column",
        },
        body: {
          flexGrow: 1,
          height: 0,
          paddingRight: 0,
        },
      }}
    >
      <Tabs orientation="vertical" defaultValue="global" pt="2rem" h="100%">
        <Tabs.List miw={200}>
          {shortcutGroups.map(shortcutGroup => (
            <Tabs.Tab key={shortcutGroup} value={shortcutGroup}>
              {GROUP_LABLES[shortcutGroup]}
            </Tabs.Tab>
          ))}
        </Tabs.List>

        {shortcutGroups.map(shortcutGroup => (
          <Tabs.Panel
            value={shortcutGroup}
            key={shortcutGroup}
            pl="lg"
            style={{ height: "100%" }}
          >
            <ScrollArea h="100%" pr="lg">
              {groupedShortcuts[shortcutGroup].map(shortcut => (
                <Group
                  key={shortcut.id}
                  justify="space-between"
                  style={{ borderRadius: "0.5rem" }}
                  p="sm"
                  my="sm"
                  bg={
                    Object.keys(actions).includes(shortcut.id)
                      ? "brand-light"
                      : undefined
                  }
                >
                  <Text>
                    {shortcut.name}
                    {Object.keys(actions).includes(shortcut.id) ? "*" : null}
                  </Text>
                  <Shortcut shortcut={shortcut.shortcut[0]} />
                </Group>
              ))}
            </ScrollArea>
          </Tabs.Panel>
        ))}
      </Tabs>
    </Modal>
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
