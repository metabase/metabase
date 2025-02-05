import { skipToken, useGetCardQuery, useListRecentsQuery } from "metabase/api";
import {
  ActionIcon,
  Box,
  Flex,
  Icon,
  Popover,
  Text,
  TextInput,
} from "metabase/ui";
import type {
  CardId,
  Field,
  RecentItem,
  VizSettingColumnReference,
} from "metabase-types/api";

import S from "./ChartSettingValuePicker.module.css";

function QuestionColumns({
  columns,
  onSelect,
}: {
  columns: Field[];
  onSelect: (name: string) => void;
}) {
  return (
    <ol>
      {columns.map(col => (
        <li
          key={col.name}
          onClick={() => onSelect(col.name)}
          className={S.item}
        >
          {col.display_name}
        </li>
      ))}
    </ol>
  );
}

function RecentsList({
  onSelectQuestion,
}: {
  onSelectQuestion: (cardId: CardId) => void;
}) {
  const { data: recents = [], isLoading } = useListRecentsQuery();

  function questionsOnly(recent: RecentItem) {
    return recent.model === "card";
  }

  return (
    <Box>
      {isLoading ? (
        <Text>Loading...</Text>
      ) : (
        <Box>
          {recents.filter(questionsOnly).map(recent => (
            <Box className={S.item} key={recent.id}>
              <Text
                onClick={() => onSelectQuestion(recent.id)}
                key={recent.id}
                color="inherit"
                truncate
              >
                {recent.name}
              </Text>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

interface ChartSettingValuePickerProps {
  value: VizSettingColumnReference | null | undefined;
  onChange: (value: VizSettingColumnReference | null | undefined) => void;
}

export function ChartSettingValuePicker({
  value,
  columnReferenceConfig,
  onChange,
}: ChartSettingValuePickerProps) {
  const { data } = useGetCardQuery(
    value?.card_id ? { id: value.card_id } : skipToken,
  );

  const selectedCard = value?.card_id && data ? data : null;

  return (
    <Popover position="bottom-end" trapFocus>
      <Popover.Target>
        <ActionIcon>
          <Icon name="bolt" />
        </ActionIcon>
      </Popover.Target>
      <Popover.Dropdown className={S.popover}>
        {!selectedCard && (
          <TextInput
            className={S.search}
            placeholder="Search for a value for {{Goal}}"
            rightSection={
              <ActionIcon>
                <Icon name="folder" />
              </ActionIcon>
            }
          />
        )}
        {selectedCard && (
          <Flex className={S.selected}>
            <Text>{selectedCard.name}</Text>{" "}
            <ActionIcon ml="auto">
              <Icon onClick={() => onChange(undefined)} name="close" />
            </ActionIcon>
          </Flex>
        )}
        {selectedCard ? (
          <Box>
            <QuestionColumns
              columns={selectedCard.result_metadata.filter(
                columnReferenceConfig.isValidColumn,
              )}
              onSelect={columnName =>
                onChange({
                  type: "card",
                  card_id: value?.card_id,
                  column_name: columnName,
                })
              }
            />
          </Box>
        ) : (
          <RecentsList
            onSelectQuestion={cardId =>
              onChange({ type: "card", card_id: cardId, column_name: "" })
            }
          />
        )}
      </Popover.Dropdown>
    </Popover>
  );
}
