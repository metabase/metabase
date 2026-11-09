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
import { GenerateExpressionPrompt } from "../GenerateExpressionPrompt";

const SCREEN_WIDTH = 472;

type Screen = "generate" | "combine" | "extract";

type ShortcutsMenuProps = {
  query: Lib.Query;
  stageIndex: number;
  expressionMode: Lib.ExpressionMode;
  availableColumns: Lib.ColumnMetadata[];
  getSource: () => string;
  onSubmit: (clause: Lib.ExpressionClause, name: string) => void;
  onGenerate: (expression: string) => void;
};

export function ShortcutsMenu({
  query,
  stageIndex,
  expressionMode,
  availableColumns,
  getSource,
  onSubmit,
  onGenerate,
}: ShortcutsMenuProps) {
  const [screen, setScreen] = useState<Screen | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [prompt, setPrompt] = useState("");

  // Mantine closes a popover on any click outside its own DOM, which includes
  // the portaled column pickers inside it. The overlay stack knows they are on top.
  const closeProps = useGatedCloseProps({
    opened: screen != null,
    closeOnClickOutside: true,
    closeOnEscape: true,
  });

  const items: { screen: Screen; name: string; icon: IconName }[] = [
    { screen: "generate", name: t`Generate with AI`, icon: "metabot" },
  ];
  if (expressionMode === "expression" && hasCombinations(availableColumns)) {
    items.push({
      screen: "combine",
      name: t`Combine columns`,
      icon: "combine",
    });
  }
  if (
    expressionMode === "expression" &&
    hasExtractions(query, availableColumns)
  ) {
    items.push({
      screen: "extract",
      name: t`Extract part of a column`,
      icon: "extract",
    });
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

  const handleGenerate = (expression: string) => {
    close();
    onGenerate(expression);
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
        {screen === "generate" && (
          <GenerateExpressionPrompt
            query={query}
            stageIndex={stageIndex}
            expressionMode={expressionMode}
            availableColumns={availableColumns}
            value={prompt}
            getSource={getSource}
            onValueChange={setPrompt}
            onGenerate={handleGenerate}
            onClose={close}
          />
        )}
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
