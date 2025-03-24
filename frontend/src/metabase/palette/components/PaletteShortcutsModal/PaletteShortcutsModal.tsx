import cx from "classnames";
import { useKBar } from "kbar";
import { t } from "ttag";
import _ from "underscore";

import Styles from "metabase/css/core/index.css";
import { METAKEY } from "metabase/lib/browser";
import {
  Box,
  Group,
  Kbd,
  Modal,
  type ModalProps,
  SimpleGrid,
  Text,
} from "metabase/ui";

// import S from "./PaletteShortcutsModal.module.css";

export const GROUP_LABLES = {
  global: `Site-wide shortcuts`,
  dashboard: "Dashboard",
  "edit-dashboard": "Edit Dashboard",
} as const;

export const PaletteShortcutsModal = ({
  onClose,
  open,
}: {
  onClose: ModalProps["onClose"];
  open: boolean;
}) => {
  const { actions } = useKBar(state => ({ actions: state.actions }));

  const shortcutActions = _.groupBy(
    Object.values(actions).filter(action => action.shortcut),
    "shortcutGroup",
  );

  return (
    <Modal
      opened={open}
      onClose={onClose}
      title={t`Shortcuts`}
      withCloseButton={false}
      size="xl"
      styles={{
        content: {
          maxHeight: "70vh",
        },
      }}
    >
      <SimpleGrid cols={2}>
        {Object.keys(shortcutActions).map(shortcutGroup => (
          <Box
            key={shortcutGroup}
            className={cx(Styles.bordered, Styles.rounded)}
            h="fit-content"
          >
            {GROUP_LABLES[shortcutGroup] && (
              <Text
                className={cx(Styles.p1, Styles.textBold, Styles.borderBottom)}
              >
                {GROUP_LABLES[shortcutGroup]}
              </Text>
            )}
            {shortcutActions[shortcutGroup].map(action => (
              <Group
                key={action.id}
                justify="space-between"
                className={cx(Styles.p1, Styles.borderBottom)}
              >
                <Text p={0}>{action.name}</Text>
                <Shortcut shortcut={action.shortcut?.join("")} />
              </Group>
            ))}
          </Box>
        ))}
      </SimpleGrid>
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
