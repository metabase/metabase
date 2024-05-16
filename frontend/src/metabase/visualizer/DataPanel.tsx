import { useState } from "react";
import { useList } from "react-use";
import { t } from "ttag";

import { cardApi } from "metabase/api";
import { QuestionPickerModal } from "metabase/common/components/QuestionPicker";
import IconButtonWrapper from "metabase/components/IconButtonWrapper";
import { Ellipsified } from "metabase/core/components/Ellipsified";
import { color } from "metabase/lib/colors";
import { useDispatch } from "metabase/lib/redux";
import {
  Accordion,
  Card,
  Button,
  Flex,
  Icon,
  Text,
  Divider,
} from "metabase/ui";
import { isDimension, isMetric } from "metabase-lib/v1/types/utils/isa";
import type { Card as ICard, CardId } from "metabase-types/api";

interface DataPanelProps {
  onAddCard: (card: ICard) => void;
}

export function DataPanel({ onAddCard }: DataPanelProps) {
  const [isQuestionPickerOpen, setQuestionPickerOpen] = useState(false);
  const [cards, cardActions] = useList<ICard>([]);

  const dispatch = useDispatch();

  const handleQuestionSelected = async ({ id }: { id: CardId }) => {
    const { data: card } = await dispatch(
      cardApi.endpoints.getCard.initiate({ id }),
    );
    if (card) {
      cardActions.push(card);
      setQuestionPickerOpen(false);
    }
  };

  return (
    <>
      <Card pt="xs" mih={300}>
        <Flex direction="row" align="center" justify="space-between">
          <Text fw="bold" display="block">{t`Data`}</Text>
          <Button
            variant="subtle"
            leftIcon={<Icon name="add" />}
            onClick={() => setQuestionPickerOpen(true)}
          />
        </Flex>
        <Divider />
        <Accordion
          chevron={null}
          multiple
          mt="md"
          styles={{
            item: {
              border: "none",
              "&[data-active]": {
                border: "none",
              },
            },
            control: { paddingLeft: 0 },
            content: { border: "none" },
            label: { padding: 0 },
            chevron: { display: "none" },
          }}
        >
          {cards.map(card => (
            <CardListItem
              key={card.id}
              card={card}
              onAddCard={() => onAddCard(card)}
            />
          ))}
        </Accordion>
      </Card>
      {isQuestionPickerOpen && (
        <QuestionPickerModal
          onChange={handleQuestionSelected}
          onClose={() => setQuestionPickerOpen(false)}
        />
      )}
    </>
  );
}

function CardListItem({
  card,
  onAddCard,
}: {
  card: ICard;
  onAddCard: () => void;
}) {
  // TODO align metrics+dimensions filtering with getSingleSeriesDimensionsAndMetrics
  const dimensions =
    card?.result_metadata.filter(col => isDimension(col) && !isMetric(col)) ??
    [];
  const metrics = card?.result_metadata.filter(isMetric) ?? [];

  return (
    <Accordion.Item value={String(card.id)}>
      <Accordion.Control>
        <Flex direction="row" align="center" justify="space-between">
          <Flex direction="row" align="center" maw="80%">
            <div>
              <Icon name="table" size={16} />
            </div>
            <Ellipsified style={{ marginLeft: "4px" }}>{card.name}</Ellipsified>
          </Flex>
          <IconButtonWrapper
            onClick={e => {
              e.stopPropagation();
              onAddCard();
            }}
          >
            <Icon name="add" color={color("brand")} />
          </IconButtonWrapper>
        </Flex>
      </Accordion.Control>
      <Accordion.Panel>
        {metrics.length > 0 && (
          <div style={{ marginTop: "16px" }}>
            <Text fw="bold">{t`Measures`}</Text>
            <ul>
              {metrics.map(col => (
                <li key={col.name} style={{ marginTop: "8px" }}>
                  {col.display_name}
                </li>
              ))}
            </ul>
          </div>
        )}
        {dimensions.length > 0 && (
          <div style={{ marginTop: "16px" }}>
            <Text fw="bold">{t`Dimensions`}</Text>
            <ul>
              {dimensions.map(col => (
                <li key={col.name} style={{ marginTop: "8px" }}>
                  {col.display_name}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Accordion.Panel>
    </Accordion.Item>
  );
}
