import {
  type EmojiPickerListCategoryHeaderProps,
  type EmojiPickerListEmojiProps,
  type Emoji as EmojiType,
  EmojiPicker as Picker,
} from "frimousse";
import { type CSSProperties, type ChangeEvent, useState } from "react";
import { t } from "ttag";

import { ActionIcon, Box, Icon, Paper, Text, TextInput } from "metabase/ui";

import S from "./EmojiPicker.module.css";

// Snapshot from https://cdn.jsdelivr.net/npm/emojibase-data@16.0.3/en/data.json
const EMOJIBASE_URL = "/app/assets/emoji";

type EmojiPickerProps = {
  search?: string;
  hideSearch?: boolean;
  onEmojiSelect?: (emoji: EmojiType) => void;
};

export function EmojiPicker({
  search: controlledSearch,
  hideSearch = false,
  onEmojiSelect,
}: EmojiPickerProps) {
  const [search, setSearch] = useState("");
  const handleSearchChange = (e: ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
  };

  const searchValue = controlledSearch ?? search;

  return (
    <Paper data-testid="emoji-picker" radius="sm">
      <Picker.Root
        className={S.root}
        emojibaseUrl={EMOJIBASE_URL}
        locale="en"
        onEmojiSelect={(emoji) => onEmojiSelect?.(emoji)}
      >
        {!hideSearch && (
          <Box p="sm" pb="0rem">
            <TextInput
              autoFocus
              frimousse-search="true"
              placeholder={t`Search...`}
              value={searchValue}
              onChange={handleSearchChange}
              leftSection={<Icon name="search" />}
              rightSectionPointerEvents="all"
              rightSection={
                <Icon
                  cursor="pointer"
                  name="close"
                  visibility={searchValue ? "visible" : "hidden"}
                  onClick={() => setSearch("")}
                />
              }
            />
          </Box>
        )}
        <Picker.Search className={S.pickerSearch} value={searchValue} />
        <Picker.Viewport className={S.pickerViewport}>
          <Picker.Loading
            className={S.pickerMessage}
          >{t`Loading…`}</Picker.Loading>
          <Picker.Empty
            className={S.pickerMessage}
          >{t`No emoji found.`}</Picker.Empty>
          <Picker.List
            className={S.pickerList}
            components={{ CategoryHeader, Emoji }}
          />
        </Picker.Viewport>
      </Picker.Root>
    </Paper>
  );
}

function CategoryHeader({
  category,
  ref,
  ...props
}: EmojiPickerListCategoryHeaderProps) {
  return (
    <Box px="sm" pos="sticky" top={0} bg="background-primary" {...props}>
      <Text fz="sm" c="text-secondary">
        {category.label}
      </Text>
    </Box>
  );
}

function Emoji({
  emoji,
  ref,
  ...props
}: Omit<EmojiPickerListEmojiProps, "color">) {
  return (
    <ActionIcon
      c="text-primary"
      component="button"
      w="2rem"
      fz="1.25rem"
      ref={ref as React.RefObject<HTMLButtonElement>}
      data-emoji={emoji.emoji}
      styles={{
        root: {
          // for colored backgrounds
          "--emoji": `"${emoji.emoji}"`,
        } as CSSProperties,
      }}
      {...props}
    >
      {emoji.emoji}
    </ActionIcon>
  );
}
