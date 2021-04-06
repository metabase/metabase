/* eslint-disable react/prop-types */
import React, { Component } from "react";
import PropTypes from "prop-types";
import _ from "underscore";
import { t } from "ttag";

import ButtonGroup from "metabase/components/ButtonGroup";
import CheckBox from "metabase/components/CheckBox";
import Text from "metabase/components/type/Text";
import Label from "metabase/components/type/Label";
import StackedCheckBox from "metabase/components/StackedCheckBox";
import Toggle from "metabase/components/Toggle";

export default class EmailAttachmentPicker extends Component {
  DEFAULT_ATTACHMENT_TYPE = "csv";

  state = {
    isEnabled: false,
    selectedAttachmentType: this.DEFAULT_ATTACHMENT_TYPE,
    selectedCardIds: new Set(),
  };

  static propTypes = {
    pulse: PropTypes.object.isRequired,
    setPulse: PropTypes.func.isRequired,
  };

  componentDidMount() {
    this.setState(this.calculateStateFromCards());
  }

  componentDidUpdate() {
    const newState = this.calculateStateFromCards();

    newState.isEnabled = newState.isEnabled || this.state.isEnabled;
    if (newState.selectedCardIds.size === 0) {
      newState.selectedAttachmentType = this.state.selectedAttachmentType;
    }

    if (!this.shouldUpdateState(newState, this.state)) {
      this.setState(newState);
    }
  }

  calculateStateFromCards() {
    const { cards } = this.props;
    const selectedCards = cards.filter(card => {
      return card.include_csv || card.include_xls;
    });

    return {
      isEnabled: selectedCards.length > 0,
      selectedAttachmentType:
        this.attachmentTypeFor(selectedCards) || this.DEFAULT_ATTACHMENT_TYPE,
      selectedCardIds: new Set(selectedCards.map(card => card.id)),
    };
  }

  shouldUpdateState(newState, currentState) {
    return (
      (currentState.isEnabled || !newState.isEnabled) &&
      newState.selectedAttachmentType === currentState.selectedAttachmentType &&
      _.isEqual(newState.selectedCardIds, currentState.selectedCardIds)
    );
  }

  /*
   * Reaches into the parent component (via setPulse) to update its pulsecard's include_{csv,xls} values
   * based on this component's state.
   */
  updatePulseCards(attachmentType, selectedCardIds) {
    const { pulse, setPulse } = this.props;
    const isXls = attachmentType === "xls",
      isCsv = attachmentType === "csv";

    this.setState({ selectedAttachmentType: attachmentType });

    setPulse({
      ...pulse,
      cards: pulse.cards.map(card => {
        card.include_csv = selectedCardIds.has(card.id) && isCsv;
        card.include_xls = selectedCardIds.has(card.id) && isXls;
        return card;
      }),
    });
  }

  cardIds() {
    return new Set(this.props.cards.map(card => card.id));
  }

  cardIdsToCards(cardIds) {
    const { pulse } = this.props;

    return pulse.cards.filter(card => cardIds.has(card.id));
  }

  attachmentTypeFor(cards) {
    if (cards.some(c => c.include_xls)) {
      return "xls";
    } else if (cards.some(c => c.include_csv)) {
      return "csv";
    } else {
      return null;
    }
  }

  /*
   * Called when the attachment type toggle (csv/xls) is clicked
   */
  setAttachmentType = newAttachmentType => {
    this.updatePulseCards(newAttachmentType, this.state.selectedCardIds);
  };

  /*
   * Called when attachments are enabled/disabled at all
   */
  toggleAttach = includeAttachment => {
    this.setState({ isEnabled: includeAttachment });
  };

  /*
   * Called on card selection
   */
  onToggleCard(card) {
    this.setState(({ selectedAttachmentType, selectedCardIds }) => {
      const id = card.id;
      const attachmentType =
        this.attachmentTypeFor(this.cardIdsToCards(selectedCardIds)) ||
        selectedAttachmentType;

      if (selectedCardIds.has(id)) {
        selectedCardIds.delete(id);
      } else {
        selectedCardIds.add(id);
      }

      this.updatePulseCards(attachmentType, selectedCardIds);
      return { selectedCardIds };
    });
  }

  /*
   * Called when (de)select-all checkbox is clicked
   */
  onToggleAll = () => {
    const { cards } = this.props;

    this.setState(({ selectedAttachmentType, selectedCardIds }) => {
      const attachmentType =
        this.attachmentTypeFor(this.cardIdsToCards(selectedCardIds)) ||
        selectedAttachmentType;
      let newSelectedCardIds = this.cardIds();
      if (this.areAllSelected(cards, selectedCardIds)) {
        newSelectedCardIds = new Set();
      }

      this.updatePulseCards(attachmentType, newSelectedCardIds);
      return { selectedCardIds: newSelectedCardIds };
    });
  };

  areAllSelected(allCards, selectedCardSet) {
    return allCards.length === selectedCardSet.size;
  }

  areOnlySomeSelected(allCards, selectedCardSet) {
    return 0 < selectedCardSet.size && selectedCardSet.size < allCards.length;
  }

  render() {
    const { cards } = this.props;
    const { isEnabled, selectedAttachmentType, selectedCardIds } = this.state;

    return (
      <div>
        <Toggle value={isEnabled} onChange={this.toggleAttach} />

        {isEnabled && (
          <div>
            <div className="my1 flex justify-between">
              <Label className="pt1">{t`File format`}</Label>
              <ButtonGroup
                options={[
                  { name: ".csv", value: "csv" },
                  { name: ".xlsx", value: "xls" },
                ]}
                onChange={this.setAttachmentType}
                value={selectedAttachmentType}
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
