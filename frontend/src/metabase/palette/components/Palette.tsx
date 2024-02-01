import { useEffect, useState } from "react";
import { t } from "ttag";
import CommandPalette, {
  getItemIndex,
  type JsonStructure as CommandPaletteActions,
  useHandleOpenCommandPalette,
} from "react-cmdk";
import { Flex, Icon, Text } from "metabase/ui";
import type { CommandPalettePageId } from "../hooks/useCommandPalette";
import { useCommandPalette } from "../hooks/useCommandPalette";
import "./Palette.css";
import { CommandPaletteStyled } from "./Palette.styled";

// TODO: Maybe scroll to the selected item in the palette when it's out of sight

const PalettePage = ({
  id,
  actions,
  searchPrefix = [],
}: {
  id: CommandPalettePageId;
  actions: CommandPaletteActions;
  searchPrefix?: string[];
}) => (
  <CommandPalette.Page id={id} searchPrefix={searchPrefix}>
    {actions.length
      ? actions.map(list => (
          <CommandPalette.List key={list.id} heading={list.heading}>
            {list.items.map(({ id, ...rest }) => (
              <CommandPalette.ListItem
                showType={false}
                key={id}
                index={getItemIndex(actions, id)}
                {...rest}
              />
            ))}
          </CommandPalette.List>
        ))
      : null}
  </CommandPalette.Page>
);

const PaletteFooter = () => {
  return (
    <Flex p=".5rem 1.33rem" gap="1.5rem">
      <Flex gap=".33rem">
        <Icon color="#949AAB" name="sort" />
        <Text weight="bold" size="10px" color="#696E7B">
          SELECT
        </Text>
      </Flex>
      <Flex gap=".33rem">
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M3.03377 10.25H4.10128H12C12.6904 10.25 13.25 9.69036 13.25 9V5C13.25 4.30964 12.6904 3.75 12 3.75H9.4C9.26193 3.75 9.15 3.86193 9.15 4C9.15 4.13807 9.26193 4.25 9.4 4.25H12C12.4143 4.25 12.75 4.58583 12.75 5V9C12.75 9.41417 12.4143 9.75 12 9.75H4.10128H3.03375L3.71717 8.92991L5.19205 7.16005C5.19205 7.16005 5.19206 7.16005 5.19206 7.16005C5.28045 7.05397 5.26611 6.89634 5.16005 6.80795L5.16004 6.80795C5.05398 6.71956 4.89634 6.73388 4.80794 6.83995L3.03377 10.25ZM3.03377 10.25L3.71716 11.0701L5.19205 12.84L5.19206 12.84C5.28043 12.946 5.26613 13.1037 5.16003 13.1921C5.05396 13.2804 4.89633 13.2661 4.80794 13.16C4.80794 13.16 4.80793 13.16 4.80793 13.16L2.30794 10.16L2.30792 10.16C2.23071 10.0673 2.23067 9.93269 2.30794 9.83995C2.30794 9.83995 2.30794 9.83995 2.30795 9.83994L4.80793 6.83996L3.03377 10.25Z"
            fill="#949AAB"
            stroke="#949AAB"
          />
        </svg>
        <Text weight="bold" size="10px" color="#696E7B">
          OPEN
        </Text>
      </Flex>
    </Flex>
  );
};

export const Palette = () => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState<CommandPalettePageId>("root");
  const { defaultActions, adminSettingsActions } = useCommandPalette({
    query,
    setPage,
    setQuery,
  });
  useHandleOpenCommandPalette(setOpen);

  useEffect(() => {
    // Hacky solution since react-cmdk doesn't provide a ref to the input
    setTimeout(() => {
      const input = document.getElementById("command-palette-search-input");
      if (input) {
        input.setAttribute("autocomplete", "off");
      }
    }, 0);
  }, [query, open]);

  // TODO: Make the input bold
  // TODO: Make the search prefix bold
  // TODO: Do this in a non-hacky way
  return (
    <CommandPaletteStyled
      onChangeSearch={setQuery}
      onChangeOpen={setOpen}
      search={query}
      placeholder="Jump to..."
      isOpen={open}
      page={page}
      footer={<PaletteFooter />}
    >
      <PalettePage id="root" actions={defaultActions} />
      <PalettePage
        id="admin_settings"
        actions={adminSettingsActions}
        searchPrefix={[t`Admin settings`]}
      />
    </CommandPaletteStyled>
  );
};
