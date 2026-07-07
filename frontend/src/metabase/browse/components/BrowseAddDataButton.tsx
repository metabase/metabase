import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { AddDataModal } from "metabase/nav/containers/MainNavbar/MainNavbarContainer/AddDataModal";
import { useAddDataPermissions } from "metabase/nav/containers/MainNavbar/MainNavbarContainer/AddDataModal/use-add-data-permission";
import { trackAddDataModalOpened } from "metabase/nav/containers/MainNavbar/analytics";
import { Button, Icon } from "metabase/ui";

export function BrowseAddDataButton() {
  const { canPerformMeaningfulActions } = useAddDataPermissions();
  const [
    addDataModalOpened,
    { open: openAddDataModal, close: closeAddDataModal },
  ] = useDisclosure(false);

  if (!canPerformMeaningfulActions) {
    return null;
  }

  return (
    <>
      <Button
        leftSection={<Icon name="add" />}
        onClick={() => {
          trackAddDataModalOpened("browse-databases");
          openAddDataModal();
        }}
      >
        {t`Add data`}
      </Button>
      <AddDataModal opened={addDataModalOpened} onClose={closeAddDataModal} />
    </>
  );
}
