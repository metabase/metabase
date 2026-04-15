import { useState } from "react";
import { c, t } from "ttag";

import { PLUGIN_SNIPPET_FOLDERS } from "metabase/plugins";
import { ActionIcon, Icon, Menu } from "metabase/ui";
import type { NativeQuerySnippet } from "metabase-types/api";

import { SnippetModal, type SnippetModalType } from "./SnippetModal";

type SnippetMoreMenuProps = {
  snippet: NativeQuerySnippet;
};

export function SnippetMoreMenu({ snippet }: SnippetMoreMenuProps) {
  const [modalType, setModalType] = useState<SnippetModalType>();

  return (
    <>
      <SnippetMenu onOpenModal={setModalType} snippet={snippet} />
      {!!modalType && (
        <SnippetModal
          snippet={snippet}
          modalType={modalType}
          onClose={() => setModalType(undefined)}
        />
      )}
    </>
  );
}

type SnippetMenuProps = {
  onOpenModal: (modalType: SnippetModalType) => void;
  snippet: NativeQuerySnippet;
};

function SnippetMenu({ onOpenModal, snippet }: SnippetMenuProps) {
  const menuItems = [];

  if (PLUGIN_SNIPPET_FOLDERS.isEnabled && !snippet.archived) {
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

  if (snippet.archived) {
    menuItems.push(
      <Menu.Item
        key="archive"
        leftSection={<Icon name="unarchive" />}
        onClick={() => onOpenModal("unarchive")}
      >
        {t`Unarchive`}
      </Menu.Item>,
    );
  } else {
    menuItems.push(
      <Menu.Item
        key="archive"
        leftSection={<Icon name="archive" />}
        onClick={() => onOpenModal("archive")}
      >
        {t`Archive`}
      </Menu.Item>,
    );
  }

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
