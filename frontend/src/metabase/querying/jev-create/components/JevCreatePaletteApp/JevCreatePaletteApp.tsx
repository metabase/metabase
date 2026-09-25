import { useCallback } from "react";

import { getUser } from "metabase/current-user";
import { useDispatch, useSelector } from "metabase/redux";
import { closeModal, setOpenModal } from "metabase/redux/ui";
import { isWithinIframe } from "metabase/utils/iframe";

import { useJevCreateHotkey } from "../../use-jev-create-hotkey";
import { JevCreatePalette } from "../JevCreatePalette";

/** "New with Jev", mounted once for the app: Cmd/Ctrl+J or the "+ New" menu opens it. */
export function JevCreatePaletteApp() {
  const dispatch = useDispatch();
  const isOpen = useSelector((state) => state.modal.id === "jev-create");
  const isLoggedIn = useSelector((state) => getUser(state) != null);
  const isEnabled = isLoggedIn && !isWithinIframe();

  const handleOpen = useCallback(
    () => dispatch(setOpenModal("jev-create")),
    [dispatch],
  );
  const handleClose = useCallback(() => dispatch(closeModal()), [dispatch]);

  useJevCreateHotkey({ enabled: isEnabled, isOpen, onOpen: handleOpen });

  if (!isEnabled) {
    return null;
  }
  return <JevCreatePalette opened={isOpen} onClose={handleClose} />;
}
