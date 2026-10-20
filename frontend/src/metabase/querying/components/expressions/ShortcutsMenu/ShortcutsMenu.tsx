import { useState } from "react";
import { t } from "ttag";

import {
  ActionIcon,
  Tooltip as ButtonTooltip,
  Icon,
  Menu,
  Popover,
} from "metabase/ui";
import { useGatedCloseProps } from "metabase/ui/components/overlays/overlay-stack";
import type * as Lib from "metabase-lib";
import type { IconName } from "metabase-types/api";

import {
  trackColumnCombineViaShortcut,
  trackColumnExtractViaShortcut,
} from "../../../analytics";
import { CombineColumns, hasCombinations } from "../CombineColumns";
import { ExtractColumn, hasExtractions } from "../ExtractColumn";

const SCREEN_WIDTH = 472;

type Screen = "combine" | "extract";

type ShortcutsMenuProps = {
  query: Lib.Query;
  stageIndex: number;
  availableColumns: Lib.ColumnMetadata[];
  onSubmit: (clause: Lib.ExpressionClause, name: string) => void;
};

export function ShortcutsMenu({
  query,
  stageIndex,
  availableColumns,
  onSubmit,
}: ShortcutsMenuProps) {
  const [screen, setScreen] = useState<Screen | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Mantine closes a popover on any click outside its own DOM, which includes
  // the portaled column pickers inside it. The overlay stack knows they are on top.
  const closeProps = useGatedCloseProps({
    opened: screen != null,
    closeOnClickOutside: true,
    closeOnEscape: true,
  });

  const items: { screen: Screen; name: string; icon: IconName }[] = [];
  if (hasCombinations(availableColumns)) {
    items.push({
      screen: "combine",
      name: t`Combine columns`,
      icon: "combine",
    });
  }
  if (hasExtractions(query, availableColumns)) {
    items.push({
      screen: "extract",
      name: t`Extract part of a column`,
      icon: "extract",
    });
  }

  if (items.length === 0) {
    return null;
  }

  const close = () => setScreen(null);

  // A click on the trigger while a form is open closes the form.
  const handleMenuChange = (opened: boolean) => {
    if (opened && screen != null) {
      close();
      return;
    }
    setIsMenuOpen(opened);
  };

  const handleCombineSubmit = (name: string, clause: Lib.ExpressionClause) => {
    trackColumnCombineViaShortcut(query);
    close();
    onSubmit(clause, name);
  };

  const handleExtractSubmit = (
    clause: Lib.ExpressionClause,
    name: string,
    extraction: Lib.ColumnExtraction,
  ) => {
    trackColumnExtractViaShortcut(query, stageIndex, extraction);
    close();
    onSubmit(clause, name);
  };

  return (
    <Popover
      opened={screen != null}
      onChange={(opened) => !opened && close()}
      position="bottom-end"
      {...closeProps}
    >
      <Popover.Target>
        <div>
          <Menu
            position="bottom-end"
            opened={isMenuOpen}
            onChange={handleMenuChange}
          >
            <Menu.Target>
              <ButtonTooltip label={t`Shortcuts`}>
                <ActionIcon
                  aria-label={t`Shortcuts`}
                  variant={screen != null ? "filled" : "default"}
                >
                  <Icon name="magic_wand" />
                </ActionIcon>
              </ButtonTooltip>
            </Menu.Target>
            <Menu.Dropdown>
              {items.map((item) => (
                <Menu.Item
                  key={item.screen}
                  leftSection={<Icon name={item.icon} />}
                  onClick={() => setScreen(item.screen)}
                >
                  {item.name}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
        </div>
      </Popover.Target>
      <Popover.Dropdown w={SCREEN_WIDTH} data-testid="expression-shortcut">
        {screen === "combine" && (
          <CombineColumns
            query={query}
            stageIndex={stageIndex}
            availableColumns={availableColumns}
            onSubmit={handleCombineSubmit}
            withTitle
            withPortaledPickers
          />
        )}
        {screen === "extract" && (
          <ExtractColumn
            query={query}
            stageIndex={stageIndex}
            availableColumns={availableColumns}
            onSubmit={handleExtractSubmit}
          />
        )}
      </Popover.Dropdown>
    </Popover>
  );
}
