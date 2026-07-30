import { t } from "ttag";

import { Button, Icon } from "metabase/ui";

import { useCloseSharingMenu } from "../SharingMenu";

export function EmbedButton({ onClick }: { onClick: () => void }) {
  const closeMenu = useCloseSharingMenu();

  return (
    <Button
      variant="default"
      h="2rem"
      px="md"
      py="sm"
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
