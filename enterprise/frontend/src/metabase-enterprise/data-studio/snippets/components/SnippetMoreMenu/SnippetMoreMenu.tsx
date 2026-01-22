import { useState } from "react";
import { c, t } from "ttag";

import { PLUGIN_SNIPPET_FOLDERS } from "metabase/plugins";
import { ActionIcon, Icon, Menu } from "metabase/ui";
import type { NativeQuerySnippet } from "metabase-types/api";

import { DeleteSnippetModal } from "../DeleteSnippetModal";

type SnippetModalType = "move" | "delete";

type SnippetMoreMenuProps = {
  snippet: NativeQuerySnippet;
  onDelete?: () => void;
};

export function SnippetMoreMenu({ snippet, onDelete }: SnippetMoreMenuProps) {
  const [modalType, setModalType] = useState<SnippetModalType>();

  return (
    <>
      <SnippetMenu onOpenModal={setModalType} />
      {modalType != null && (
        <SnippetModal
          snippet={snippet}
          modalType={modalType}
          onDelete={onDelete}
          onClose={() => setModalType(undefined)}
        />
      )}
    </>
  );
}

type SnippetMenuProps = {
  onOpenModal: (modalType: SnippetModalType) => void;
};

function SnippetMenu({ onOpenModal }: SnippetMenuProps) {
  const menuItems = [];

  if (PLUGIN_SNIPPET_FOLDERS.isEnabled) {
    menuItems.push(
      <Menu.Item
        key="move"
        leftSection={<Icon name="move" />}
        onClick={() => onOpenModal("move")}
      >
        {c("A verb, not a noun").t`Move`}
      </Menu.Item>,
    );
  }

  menuItems.push(
    <Menu.Item
      key="delete"
      leftSection={<Icon name="trash" />}
      onClick={() => onOpenModal("delete")}
    >
      {t`Delete`}
    </Menu.Item>,
  );

  if (menuItems.length === 0) {
    return null;
  }

  return (
    <Menu>
      <Menu.Target>
        <ActionIcon size="sm" aria-label={t`Snippet menu options`}>
          <Icon name="ellipsis" />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>{menuItems}</Menu.Dropdown>
    </Menu>
  );
}

type SnippetModalProps = {
  snippet: NativeQuerySnippet;
  modalType: SnippetModalType;
  onDelete?: () => void;
  onClose: () => void;
};

function SnippetModal({
  snippet,
  modalType,
  onDelete,
  onClose,
}: SnippetModalProps) {
  switch (modalType) {
    case "move":
      return (
        <PLUGIN_SNIPPET_FOLDERS.MoveSnippetModal
          snippet={snippet}
          onClose={onClose}
        />
      );
    case "delete":
      return (
        <DeleteSnippetModal
          snippet={snippet}
          onDelete={onDelete}
          onClose={onClose}
        />
      );
    default:
      return null;
  }
}
