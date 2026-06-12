import {
  type ReactNode,
  createContext,
  useContext,
  useMemo,
  useState,
} from "react";
import { t } from "ttag";

import { Button, CopyButton, Icon } from "metabase/ui";

import { SHARING_MENU_WIDTH, SharingMenu } from "./SharingMenu";

const CloseMenuContext = createContext<() => void>(() => {});

export function AdminSharingMenu({ children }: { children: ReactNode }) {
  const [opened, setOpened] = useState(false);
  const closeMenu = useMemo(() => () => setOpened(false), []);

  return (
    <CloseMenuContext.Provider value={closeMenu}>
      <SharingMenu
        opened={opened}
        onChange={setOpened}
        width={SHARING_MENU_WIDTH}
        styles={{ dropdown: { padding: 0 }, divider: { margin: 0 } }}
      >
        {children}
      </SharingMenu>
    </CloseMenuContext.Provider>
  );
}

export function CopyLinkButton({ url }: { url: string }) {
  return (
    <CopyButton value={url} timeout={2000}>
      {({ copied, copy }) => (
        <Button
          variant="filled"
          w="7.5rem"
          h="2rem"
          radius="sm"
          leftSection={
            <Icon name={copied ? "verified_round" : "link"} aria-hidden />
          }
          onClick={copy}
        >
          {copied ? t`Copied` : t`Copy link`}
        </Button>
      )}
    </CopyButton>
  );
}

export function EmbedButton({ onClick }: { onClick: () => void }) {
  const closeMenu = useContext(CloseMenuContext);

  return (
    <Button
      variant="default"
      w="7.5rem"
      h="2rem"
      radius="sm"
      leftSection={<Icon name="embed" aria-hidden />}
      onClick={() => {
        closeMenu();
        onClick();
      }}
    >
      {t`Embed`}
    </Button>
  );
}
