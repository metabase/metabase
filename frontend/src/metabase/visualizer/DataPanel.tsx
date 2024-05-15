import { useState } from "react";
import { useList } from "react-use";
import { t } from "ttag";

import { cardApi } from "metabase/api";
import { QuestionPickerModal } from "metabase/common/components/QuestionPicker";
import IconButtonWrapper from "metabase/components/IconButtonWrapper";
import { Ellipsified } from "metabase/core/components/Ellipsified";
import { color } from "metabase/lib/colors";
import { useDispatch } from "metabase/lib/redux";
import { Card, Button, Flex, Icon, Text, Divider } from "metabase/ui";
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
      <Card pt="xs">
        <Flex direction="row" align="center" justify="space-between">
          <Text fw="bold" display="block">{t`Data`}</Text>
          <Button
            variant="subtle"
            leftIcon={<Icon name="add" />}
            onClick={() => setQuestionPickerOpen(true)}
          />
        </Flex>
        <Divider />
        <ul style={{ marginTop: "8px" }}>
          {cards.map(card => (
            <li key={card.id} style={{ padding: "4px" }}>
              <Flex direction="row" align="center" justify="space-between">
                <Flex direction="row" align="center" maw="80%">
                  <div>
                    <Icon name="table" size={16} />
                  </div>
                  <Ellipsified style={{ marginLeft: "4px" }}>
                    {card.name}
                  </Ellipsified>
                </Flex>
                <IconButtonWrapper onClick={() => onAddCard(card)}>
                  <Icon name="add" color={color("brand")} />
                </IconButtonWrapper>
              </Flex>
            </li>
          ))}
        </ul>
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
