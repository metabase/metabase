import cx from "classnames";
import { t } from "ttag";
import _ from "underscore";

import Styles from "metabase/css/core/index.css";
import { METAKEY } from "metabase/lib/browser";
import { shortcuts as ALL_SHORTCUTS } from "metabase/palette/shortcuts";
import type { ShortcutGroup } from "metabase/palette/types";
import {
  Group,
  Kbd,
  Modal,
  type ModalProps,
  ScrollArea,
  Tabs,
  Text,
} from "metabase/ui";

import { GROUP_LABLES } from "../../constants";

const groupedShortcuts = _.groupBy(
  _.mapObject(ALL_SHORTCUTS, (val, id) => ({ id, ...val })),
  "shortcutGroup",
);

const shortcutGroups = Object.keys(groupedShortcuts) as ShortcutGroup[];

export const PaletteShortcutsModal = ({
  onClose,
  open,
}: {
  onClose: ModalProps["onClose"];
  open: boolean;
}) => {
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
            <Tabs.Tab key={shortcutGroup} value={shortcutGroup}>
              {GROUP_LABLES[shortcutGroup]}
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
                const shortcuts = groupedShortcuts[shortcutGroup];

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
                  ...shortcutContexts[context].map((shortcut) => (
                    <Group
                      key={shortcut.id}
                      justify="space-between"
                      style={{ borderRadius: "0.5rem" }}
                      p="sm"
                      my="sm"
                    >
                      <Text>{shortcut.name}</Text>
                      <Shortcut shortcut={shortcut.shortcut[0]} />
                    </Group>
                  )),
                ]);
              })()}
            </ScrollArea>
          </Tabs.Panel>
        ))}
      </Tabs>
    </Modal>
  );
};

const Shortcut = (props: { shortcut: string }) => {
  const string = props.shortcut
    .replace("$mod", METAKEY)
    .replace(" ", " > ")
    .replace("+", " + ");
  const result = string.split(" ").map((x) => {
    if (x === "+" || x === ">") {
      return x;
    }

    return <Kbd key={x}>{x}</Kbd>;
  });

  return <Group gap="0.5rem">{result}</Group>;
};
