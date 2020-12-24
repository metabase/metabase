import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import ButtonGroup from "metabase/components/ButtonGroup";
import CheckBox from "metabase/components/CheckBox";
import Text from "metabase/components/type/Text";
import Label from "metabase/components/type/Label";
import StackedCheckBox from "metabase/components/StackedCheckBox";
import Toggle from "metabase/components/Toggle";

export default class EmailAttachmentPicker extends Component {
  state = {
    attachmentType: null,
    selectedCardIds: new Set(),
  };

  static propTypes = {
    pulse: PropTypes.object.isRequired,
    setPulse: PropTypes.func.isRequired,
  };

  DEFAULT_ATTACHMENT_TYPE = "csv";

  updateStateFromCards() {
    const { cards } = this.props;
    const { attachmentType } = this.state;

    const selectedCards = cards.filter(card => {
      return card.include_csv || card.include_xls;
    });

    if (!attachmentType && selectedCards.length > 0) {
      this.setState({
        attachmentType: this.attachmentTypeFor(selectedCards),
        selectedCardIds: new Set(selectedCards.map(card => card.id)),
      });
      this.updatePulse();
    }
  }

  componentDidMount() {
    this.updateStateFromCards();
  }

  componentDidUpdate() {
    this.updateStateFromCards();
  }

  cardIds = () => {
    return new Set(this.props.cards.map(card => card.id));
  };

  selectedCards = () => {
    const { selectedCardIds } = this.state;
    const { pulse } = this.props;

    return pulse.cards.filter(card => selectedCardIds.has(card.id));
  };

  attachmentTypeFor = cards => {
    if (cards.some(c => c.include_xls)) {
      return "xls";
    } else if (cards.some(c => c.include_csv)) {
      return "csv";
    } else {
      return null;
    }
  };

  attachmentTypeValue = () => {
    return this.attachmentTypeFor(this.selectedCards());
  };

  setAttachmentType = newAttachmentType => {
    this.setState(({ selectedCardIds }) => {
      return {
        attachmentType: newAttachmentType,
        selectedCardIds,
      };
    });
    this.updatePulse();
  };

  updatePulse = () => {
    const { pulse, setPulse } = this.props;
    const { attachmentType } = this.state;

    setPulse({
      ...pulse,
      cards: this.selectedCards().map(card => {
        card.include_xls = attachmentType === "xls";
        card.include_csv = attachmentType === "csv";
        return card;
      }),
    });
  };

  setAttachmentTypeFromUserInput = () => {
    const existingValue = this.attachmentTypeValue();
    this.setAttachmentType(existingValue || this.DEFAULT_ATTACHMENT_TYPE);
  };

  toggleAttach = includeAttachment => {
    if (includeAttachment) {
      this.setAttachmentTypeFromUserInput();
    } else {
      this.setAttachmentType(null);
    }
  };

  areAllSelected = (allCards, selectedCardSet) => {
    return allCards.length === selectedCardSet.size;
  };

  areOnlySomeSelected = (allCards, selectedCardSet) => {
    return 0 < selectedCardSet.size && selectedCardSet.size < allCards.length;
  };

  onToggleCard = card => {
    this.setState(({ selectedCardIds }) => {
      const id = card.id;
      if (selectedCardIds.has(id)) {
        selectedCardIds.delete(id);
      } else {
        selectedCardIds.add(id);
        this.setAttachmentTypeFromUserInput();
      }

      this.updatePulse();
    });
  };

  onToggleAll = () => {
    const { cards } = this.props;

    this.setState(({ selectedCardIds }) => {
      if (this.areAllSelected(cards, selectedCardIds)) {
        return { selectedCardIds: new Set() };
      } else {
        return { selectedCardIds: this.cardIds() };
      }
    });

    this.updatePulse();
  };

  render() {
    const { cards } = this.props;
    const { attachmentType, selectedCardIds } = this.state;

    return (
      <div>
        <Toggle value={attachmentType != null} onChange={this.toggleAttach} />

        {attachmentType != null && (
          <div>
            <div className="my1 flex justify-between">
              <Label className="pt1">{t`File format`}</Label>
              <ButtonGroup
                options={[
                  { name: ".csv", value: "csv" },
                  { name: ".xlsx", value: "xls" },
                ]}
                onChange={this.setAttachmentType}
                value={attachmentType}
              />
            </div>
            <div className="text-bold pt1 pb2 flex justify-between align-center">
              <ul>
                <li
                  className="mb2 flex align-center cursor-pointer border-bottom"
                  onClick={this.onToggleAll}
                >
                  <StackedCheckBox
                    checked={this.areAllSelected(cards, selectedCardIds)}
                    indeterminate={this.areOnlySomeSelected(
                      cards,
                      selectedCardIds,
                    )}
                  />
                  <Text ml={1}>{t`Questions to attach`}</Text>
                </li>
                {cards.map(card => (
                  <li
                    key={card.id}
                    className="pb2 flex align-center cursor-pointer"
                    onClick={() => {
                      this.onToggleCard(card);
                    }}
                  >
                    <CheckBox
                      checked={selectedCardIds.has(card.id)}
                      className="mr1"
                    />
                    {card.name}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    );
  }
}
