import data from "@emoji-mart/data";
import { useDisclosure } from "@mantine/hooks";
import { SearchIndex, init } from "emoji-mart";
import { useState } from "react";

import {
  Box,
  type ButtonProps,
  Center,
  Icon,
  Input,
  Paper,
  Popover,
  SimpleGrid,
  Stack,
  Text,
  UnstyledButton,
} from "metabase/ui";

import AddReactionS from "./AddReaction.module.css";
import { ReactionBadge } from "./ReactionBadge";

init({ data });

const convertUnicodeToEmoji = unicode => {
  // Split the string by "-" and convert each part to a code point
  const codePoints = unicode.split("-").map(code => parseInt(code, 16));
  // Convert the code points into an emoji using fromCodePoint
  return String.fromCodePoint(...codePoints);
};

export const EmojiButton = ({
  emoji,
  onClick,
}: {
  emoji: string;
  onClick: ButtonProps["onClick"];
}) => {
  return (
    <UnstyledButton onClick={onClick} className={AddReactionS.EmojiButton}>
      <Center p="xs">
        <Text fz="xl">{emoji}</Text>
      </Center>
    </UnstyledButton>
  );
};

export const ASlightlyCrapEmojiPicker = ({
  onSelect,
}: {
  onSelect: (value: string) => void;
}) => {
  const [searchText, setSearchText] = useState<string>();
  const [searchResults, setSearchResults] = useState<any[]>();

  const onSearchChange = (t: string) => {
    setSearchText(t);
    search(t);
  };

  async function search(value: string) {
    const emojis = await SearchIndex.search(value);
    const results = emojis.map(emoji => {
      return emoji.skins[0].native;
    });

    setSearchResults(results);
  }

  return (
    <Paper w="20rem" h="30rem" p="md" style={{ overflow: "hidden" }}>
      <Stack h="100%" style={{ overflow: "hidden" }}>
        <Input
          value={searchText}
          onChange={e => onSearchChange(e.target.value)}
        />
        <Stack style={{ overflowY: "auto", overflowX: "hidden" }}>
          {searchText ? (
            <SimpleGrid spacing="xs" cols={7}>
              {searchResults
                ? searchResults.map((res: string) => (
                    <EmojiButton
                      onClick={() => onSelect(res)}
                      key={res}
                      emoji={res}
                    />
                  ))
                : "No results found"}
            </SimpleGrid>
          ) : (
            data.categories.map(({ id, emojis }) => (
              <Stack key={id}>
                <Text fw="bold" tt="capitalize">
                  {id}
                </Text>
                <SimpleGrid spacing="xs" cols={7}>
                  {emojis.map(e => {
                    const emojiText = convertUnicodeToEmoji(
                      data.emojis[e].skins[0].unified,
                    );
                    return (
                      <EmojiButton
                        onClick={() => onSelect(emojiText)}
                        emoji={emojiText}
                        key={e}
                      />
                    );
                  })}
                </SimpleGrid>
              </Stack>
            ))
          )}
        </Stack>
      </Stack>
    </Paper>
  );
};

export const AddReaction = () => {
  const [opened, { toggle, close }] = useDisclosure(false);

  const onSelectReaction = () =>
    // reaction: string
    {
      // do a thing with reaction
      close();
    };

  return (
    <Popover opened={opened} onClose={close} closeOnClickOutside>
      <Popover.Target>
        <Box>
          <ReactionBadge
            tooltipLabel="Add reaction…"
            onClick={toggle}
            right={<Icon size="0.8rem" name="add" />}
          />
        </Box>
      </Popover.Target>
      <Popover.Dropdown>
        <ASlightlyCrapEmojiPicker onSelect={onSelectReaction} />
      </Popover.Dropdown>
    </Popover>
  );
};
