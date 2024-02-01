import type { Dispatch, SetStateAction } from "react";
import { useRef, useState } from "react";
import "react-cmdk/dist/cmdk.css";
import CommandPalette, {
  getItemIndex,
  type JsonStructure as CommandPaletteActions,
} from "react-cmdk";
import type { CommandPalettePageId } from "../hooks/useCommandPalette";
import { useCommandPalette } from "../hooks/useCommandPalette";
import { PaletteModal, PaletteModalContainer } from "./Palette.styled";

const PalettePage = ({
  id,
  actions,
}: {
  id: CommandPalettePageId;
  actions: CommandPaletteActions;
}) => (
  <CommandPalette.Page id={id}>
    {actions.length ? (
      actions.map(list => (
        <CommandPalette.List key={list.id} heading={list.heading}>
          {list.items.map(({ id, ...rest }) => (
            <CommandPalette.ListItem
              key={id}
              index={getItemIndex(actions, id)}
              {...rest}
            />
          ))}
        </CommandPalette.List>
      ))
    ) : (
      <CommandPalette.FreeSearchAction />
    )}
  </CommandPalette.Page>
);

export const Palette = ({
  open,
  setOpen,
}: {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
}) => {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState<CommandPalettePageId>("admin_settings");
  const { defaultActions, adminSettingsActions } = useCommandPalette({
    query,
    setPage,
  });
  const modalRef = useRef<HTMLDivElement>(null);

  return (
    <PaletteModal onClose={() => setOpen(false)}>
      <PaletteModalContainer ref={modalRef}>
        <CommandPalette
          onChangeSearch={setQuery}
          onChangeOpen={setOpen}
          search={query}
          isOpen={open}
          page={page}
        >
          <PalettePage id="root" actions={defaultActions} />
          <PalettePage id="admin_settings" actions={adminSettingsActions} />
        </CommandPalette>
      </PaletteModalContainer>
    </PaletteModal>
  );
};
