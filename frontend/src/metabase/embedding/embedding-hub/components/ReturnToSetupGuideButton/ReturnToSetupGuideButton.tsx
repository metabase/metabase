import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import { Button, Card, Icon, Text } from "metabase/ui";

import S from "./ReturnToSetupGuideButton.module.css";

/**
 * Only allow relative paths to prevent open redirect via ?returnTo=.
 */
function getSafeReturnTo(returnTo: string): string | null {
  if (returnTo.startsWith("/") && !returnTo.startsWith("//")) {
    return returnTo;
  }
  return null;
}

/**
 * Renders inside the StatusListingRoot (bottom-right fixed container)
 * via a portal, so it stacks naturally with other status items
 * (e.g. database sync progress) instead of overlapping.
 * Falls back to inline rendering if the container is not found.
 */
export const ReturnToSetupGuideButton = ({
  returnTo,
}: {
  returnTo: string;
}) => {
  const dispatch = useDispatch();
  const safePath = getSafeReturnTo(returnTo);
  const [container, setContainer] = useState<Element | null>(null);

  useEffect(() => {
    setContainer(document.getElementById("status-listing"));
  }, []);

  if (!safePath) {
    return null;
  }

  const card = (
    <Card
      className={S.root}
      shadow="md"
      p="md"
      radius="md"
      withBorder
      w="16rem"
    >
      <Text size="md" fw={700} mb="md">
        {t`Done here?`}
      </Text>
      <Button
        leftSection={<Icon name="chevronleft" />}
        variant="filled"
        fullWidth
        size="md"
        onClick={() => dispatch(push(safePath))}
      >
        {t`Back to setup guide`}
      </Button>
    </Card>
  );

  return container ? createPortal(card, container) : card;
};
