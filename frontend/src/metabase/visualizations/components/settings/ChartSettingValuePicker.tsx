import { useState } from "react";

import { useGetCardQuery, useListRecentsQuery } from "metabase/api";
import {
  ActionIcon,
  Box,
  Flex,
  Icon,
  Popover,
  Text,
  TextInput,
} from "metabase/ui";
import type { RecentItem } from "metabase-types/api";

function QuestionColumns({ selected }: { selected: RecentItem }) {
  const { data: card } = useGetCardQuery({ id: selected.id });
  return (
    <ol>
      {card?.result_metadata.map((m, i) => (
        <li key={i} onClick={() => alert("Call antons thing")}>
          {m.display_name}
        </li>
      ))}
    </ol>
  );
}

function RecentsList({
  onSelectQuestion,
}: {
  onSelectQuestion: (question: any) => void;
}) {
  const { data: recents, isLoading } = useListRecentsQuery();

  function questionsOnly(recent: RecentItem) {
    return recent.model === "card";
  }

  return (
    <Box>
      {isLoading ? (
        <Text>Loading...</Text>
      ) : (
        <Box>
          {recents &&
            recents.filter(questionsOnly).map(recent => (
              <Text onClick={() => onSelectQuestion(recent)} key={recent.id}>
                {recent.name}
              </Text>
            ))}
        </Box>
      )}
    </Box>
  );
}

export function ChartSettingValuePicker() {
  const [selected, setSelected] = useState<RecentItem | undefined>();

  // how to fetch the columns for a question

  return (
    <Popover position="bottom-end" trapFocus>
      <Popover.Target>
        <ActionIcon>
          <Icon name="bolt" />
        </ActionIcon>
      </Popover.Target>
      <Popover.Dropdown mah="300px" miw="200px">
        <TextInput
          placeholder="Search for a value for {{Goal}}"
          rightSection={
            <ActionIcon>
              <Icon name="folder" />
            </ActionIcon>
          }
        />
        {selected && (
          <Flex>
            <Text>{selected.name}</Text>{" "}
            <ActionIcon ml="auto">
              <Icon onClick={() => setSelected(undefined)} name="close" />
            </ActionIcon>
          </Flex>
        )}
        {selected ? (
          <Box ml="md">
            <QuestionColumns selected={selected} />
          </Box>
        ) : (
          <RecentsList onSelectQuestion={setSelected} />
        )}
      </Popover.Dropdown>
    </Popover>
  );
}
