import { useHotkeys } from "@mantine/hooks";
import cx from "classnames";
import { t } from "ttag";
import _ from "underscore";

import Styles from "metabase/css/core/index.css";
import { shortcuts as ALL_SHORTCUTS } from "metabase/palette/shortcuts";
import type { ShortcutDef, ShortcutGroup } from "metabase/palette/types";
import {
  Group,
  KeyboardShortcut,
  Modal,
  type ModalProps,
  ScrollArea,
  Tabs,
  Text,
} from "metabase/ui";

import { ELLIPSIS, GROUP_LABELS } from "../../constants";

const groupedShortcuts = _.groupBy(
  _.mapObject(ALL_SHORTCUTS, (val, id) => ({ id, ...val })),
  "shortcutGroup",
);

const shortcutGroups = Object.keys(groupedShortcuts).filter(
  (val) => !!val,
) as ShortcutGroup[];

export const PaletteShortcutsModal = ({
  onClose,
  open,
}: {
  onClose: ModalProps["onClose"];
  open: boolean;
}) => {
  useHotkeys([
    ["Shift+?", onClose],
    ["?", onClose],
  ]);

  return (
    <Modal
      opened={open}
      onClose={onClose}
      title={t`Shortcuts`}
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
          {shortcutGroups.map((shortcutGroup) => (
            <Tabs.Tab key={shortcutGroup} value={shortcutGroup} data-autofocus>
              {GROUP_LABELS[shortcutGroup]}
            </Tabs.Tab>
          ))}
        </Tabs.List>

        {shortcutGroups.map((shortcutGroup) => (
          <Tabs.Panel
            value={shortcutGroup}
            key={shortcutGroup}
            pl="lg"
            style={{ height: "100%" }}
          >
            <ScrollArea h="100%" pr="lg">
              {(() => {
                const shortcuts = groupedShortcuts[shortcutGroup].filter(
                  (shortcut: ShortcutDef) => !shortcut.hide,
                );

                const shortcutContexts = _.groupBy(
                  shortcuts,
                  "shortcutContext",
                );

                return Object.keys(shortcutContexts).map((context) => [
                  context !== String(undefined) ? (
                    <Text
                      py="sm"
                      m="sm"
                      key="context"
                      className={cx(Styles.borderBottom, Styles.textBold)}
                    >
                      {context}
                    </Text>
                  ) : null,
                  ...shortcutContexts[context].map((shortcut: ShortcutDef) => {
                    const keysList =
                      shortcut.shortcutDisplay || shortcut.shortcut;
                    return (
                      <Group
                        key={shortcut.id}
                        justify="space-between"
                        style={{ borderRadius: "0.5rem" }}
                        p="sm"
                        my="sm"
                      >
                        <Text>{shortcut.name}</Text>
                        <Group gap="sm" align="baseline">
                          {keysList.map((shortcutKeys, index) => (
                            <Group
                              key={`${index}-${shortcutKeys}`}
                              gap={2}
                              align="baseline"
                              wrap="nowrap"
                            >
                              {shortcutKeys === ELLIPSIS ? (
                                <Text>{ELLIPSIS}</Text>
                              ) : (
                                <KeyboardShortcut shortcut={shortcutKeys} />
                              )}
                              {index < keysList.length - 1 && (
                                <Text c="text-secondary">,</Text>
                              )}
                            </Group>
                          ))}
                        </Group>
                      </Group>
                    );
                  }),
                ]);
              })()}
            </ScrollArea>
          </Tabs.Panel>
        ))}
      </Tabs>
    </Modal>
  );
};
