import {
  type EmojiPickerListCategoryHeaderProps,
  type EmojiPickerListEmojiProps,
  type Emoji as EmojiType,
  EmojiPicker as Picker,
} from "frimousse";
import { type ChangeEvent, useState } from "react";
import { t } from "ttag";

import { ActionIcon, Box, Icon, Text, TextInput } from "metabase/ui";

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
    <Picker.Root
      className={S.root}
      emojibaseUrl={EMOJIBASE_URL}
      locale="en"
      onEmojiSelect={(emoji) => onEmojiSelect?.(emoji)}
    >
      {!hideSearch && (
        <TextInput
          placeholder={t`Search...`}
          value={searchValue}
          onChange={handleSearchChange}
          leftSection={<Icon name="search" />}
        />
      )}
      <Picker.Search className={S.pickerSearch} value={searchValue} />
      <Picker.Viewport className={S.pickerViewport}>
        <Picker.Loading>{t`Loading…`}</Picker.Loading>
        <Picker.Empty
          className={S.pickerMessage}
        >{t`No emoji found.`}</Picker.Empty>
        <Picker.List components={{ CategoryHeader, Emoji }} />
      </Picker.Viewport>
    </Picker.Root>
  );
}

function CategoryHeader({ category }: EmojiPickerListCategoryHeaderProps) {
  return (
    <Box pb="xs" pt="sm" pos="sticky" top={0} bg="var(--mb-color-bg-white)">
      <Text fz="sm" c="text-secondary" tt="uppercase">
        {category.label}
      </Text>
    </Box>
  );
}

function Emoji({ emoji, onClick }: EmojiPickerListEmojiProps) {
  return (
    <ActionIcon component="button" flex="1" fz="1.25rem" onClick={onClick}>
      {emoji.emoji}
    </ActionIcon>
  );
}
