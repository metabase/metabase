import { useHotkeys } from "@mantine/hooks";
import { useMemo, useRef, useState } from "react";
import { msgid, ngettext, t } from "ttag";

import {
  Combobox,
  FixedSizeIcon,
  Group,
  Text,
  TextInput,
  useCombobox,
} from "metabase/ui";
import { isTypeFK } from "metabase-lib/v1/types/utils/isa";

import type { SchemaViewerFlowNode } from "../types";
import { useZoomToNodes } from "../useZoomToNodes";

import S from "./SchemaViewerNodeSearch.module.css";

type SchemaViewerNodeSearchProps = {
  nodes: SchemaViewerFlowNode[];
};

interface SearchItem {
  id: string;
  label: React.ReactNode;
  text: string;
  fkCount: number;
  haystack: string;
}

export function SchemaViewerNodeSearch({ nodes }: SchemaViewerNodeSearchProps) {
  const zoomToNodes = useZoomToNodes();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");

  const combobox = useCombobox({
    defaultOpened: true,
    onDropdownClose: () => combobox.resetSelectedOption(),
    onDropdownOpen: () => combobox.updateSelectedOptionIndex("active"),
  });

  // Empty tagsToIgnore so cmd+f fires even when focus is in another input.
  useHotkeys(
    [
      [
        "mod+f",
        () => {
          inputRef.current?.focus();
          inputRef.current?.select();
          combobox.openDropdown();
        },
      ],
    ],
    [],
  );

  const allItems = useMemo<SearchItem[]>(
    () =>
      nodes.map((node) => {
        const { name, display_name, fields } = node.data;
        const label = formatTableLabel(name, display_name);
        const text = formatTableLabelText(name, display_name);
        const fkCount = fields.filter((f) => isTypeFK(f.semantic_type)).length;
        return {
          id: node.id,
          label,
          text,
          fkCount,
          haystack: `${text} ${name} ${display_name ?? ""}`.toLowerCase(),
        };
      }),
    [nodes],
  );

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === "") {
      return allItems;
    }
    return allItems.filter((item) => item.haystack.includes(q));
  }, [allItems, query]);

  const handleOptionSubmit = (nodeId: string) => {
    const item = allItems.find((i) => i.id === nodeId);
    if (item == null) {
      return;
    }
    zoomToNodes([item.id]);
    setQuery(item.text);
    combobox.closeDropdown();
    inputRef.current?.blur();
  };

  if (nodes.length === 0) {
    return null;
  }

  return (
    <Combobox
      store={combobox}
      withinPortal={false}
      onOptionSubmit={handleOptionSubmit}
    >
      <Combobox.Target>
        <TextInput
          ref={inputRef}
          leftSection={<FixedSizeIcon name="search" />}
          placeholder={t`Jump to table`}
          value={query}
          w="20rem"
          data-testid="schema-viewer-node-search-input"
          onChange={(event) => {
            setQuery(event.currentTarget.value);
            combobox.openDropdown();
            combobox.updateSelectedOptionIndex();
          }}
          onFocus={(event) => {
            // Select the previously-chosen label so typing overwrites it.
            event.currentTarget.select();
            combobox.openDropdown();
          }}
          onBlur={() => combobox.closeDropdown()}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              combobox.closeDropdown();
              inputRef.current?.blur();
            }
          }}
        />
      </Combobox.Target>
      <Combobox.Dropdown p={0}>
        {filteredItems.length === 0 ? (
          <Combobox.Empty>{t`No tables found`}</Combobox.Empty>
        ) : (
          <Combobox.Options className={S.options}>
            {/* <ScrollArea.Autosize mah={320} type="scroll"> */}
            {filteredItems.map((item) => (
              <Combobox.Option
                value={item.id}
                key={item.id}
                className={S.listItem}
              >
                <Group gap="sm" wrap="nowrap" justify="space-between" w="100%">
                  <Text className={S.label}>{item.label}</Text>
                  <Text className={S.fieldCount} c="text-tertiary" fz="xs">
                    {ngettext(
                      msgid`${item.fkCount} FK`,
                      `${item.fkCount} FKs`,
                      item.fkCount,
                    )}
                  </Text>
                </Group>
              </Combobox.Option>
            ))}
            {/* </ScrollArea.Autosize> */}
          </Combobox.Options>
        )}
      </Combobox.Dropdown>
    </Combobox>
  );
}

function formatTableLabel(name: string, displayName: string | undefined) {
  if (displayName && displayName !== name) {
    return (
      <>
        <span style={{ fontWeight: "bold" }}>{name}</span> ({displayName})
      </>
    );
  }
  return name;
}

function formatTableLabelText(name: string, displayName: string | undefined) {
  if (displayName && displayName !== name) {
    return `${name} (${displayName})`;
  }
  return name;
}
