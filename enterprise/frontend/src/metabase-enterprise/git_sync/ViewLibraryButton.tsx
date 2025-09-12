import { useState } from "react";
import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Button, Icon } from "metabase/ui";

import { ViewLibraryModal } from "./ViewLibraryModal";

export const ViewLibraryButton = () => {
  const [isOpen, setIsOpen] = useState(false);
  const isAdmin = useSelector(getUserIsAdmin);
  const syncConfigured = useSetting("git-sync-configured");

  if (!isAdmin) {
    return null;
  }

  const buttonText = syncConfigured ? t`Library` : t`Set up your library`;
  const ariaLabel = syncConfigured ? t`Browse library` : t`Set up your library`;

  return (
    <>
      <Button
        variant="subtle"
        fullWidth
        leftSection={<Icon name="collection" />}
        onClick={() => {
          setIsOpen(true);
        }}
        aria-label={ariaLabel}
      >
        {buttonText}
      </Button>
      <ViewLibraryModal
        isOpen={isOpen}
        onClose={() => {
          setIsOpen(false);
        }}
      />
    </>
  );
};
