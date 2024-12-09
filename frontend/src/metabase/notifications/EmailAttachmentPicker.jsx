import cx from "classnames";
import PropTypes from "prop-types";
import { Component } from "react";
import { t } from "ttag";
import _ from "underscore";

import { ExportSettingsWidget } from "metabase/common/components/ExportSettingsWidget";
import Toggle from "metabase/core/components/Toggle";
import CS from "metabase/css/core/index.css";
import { Box, Checkbox, Group, Icon, Text } from "metabase/ui";

export default class EmailAttachmentPicker extends Component {
  DEFAULT_ATTACHMENT_TYPE = "csv";

  state = {
    isEnabled: false,
    isFormattingEnabled: true,
    isPivotingEnabled: false,
    selectedAttachmentType: this.DEFAULT_ATTACHMENT_TYPE,
    selectedCardIds: new Set(),
  };

  static propTypes = {
    pulse: PropTypes.object.isRequired,
    setPulse: PropTypes.func.isRequired,
    cards: PropTypes.array.isRequired,
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

  _getCardsWithAttachments() {
    return this.props.cards.filter(card => {
      return card.include_csv || card.include_xls;
    });
  }

  calculateStateFromCards() {
    const selectedCards = this._getCardsWithAttachments();

    return {
      isEnabled: selectedCards.length > 0,
      selectedAttachmentType:
        this.attachmentTypeFor(selectedCards) || this.DEFAULT_ATTACHMENT_TYPE,
      selectedCardIds: new Set(selectedCards.map(card => card.id)),
      isFormattingEnabled: getInitialFormattingState(selectedCards),
      isPivotingEnabled: getInitialPivotingState(selectedCards),
    };
  }

  canConfigurePivoting() {
    return this.props.cards.some(card => card.display === "pivot");
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
    const { isFormattingEnabled, isPivotingEnabled } = this.state;

    const isXls = attachmentType === "xlsx",
      isCsv = attachmentType === "csv";

    this.setState({ selectedAttachmentType: attachmentType });

    setPulse({
      ...pulse,
      cards: pulse.cards.map(card => {
        card.include_csv = selectedCardIds.has(card.id) && isCsv;
        card.include_xls = selectedCardIds.has(card.id) && isXls;
        card.format_rows = isCsv && isFormattingEnabled; // Excel always uses formatting
        card.pivot_results = card.display === "pivot" && isPivotingEnabled;
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
      return "xlsx";
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
    if (!includeAttachment) {
      this.disableAllCards();
    }

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

  onToggleFormatting = () => {
    this.setState(
      prevState => ({
        ...prevState,
        isFormattingEnabled: !prevState.isFormattingEnabled,
      }),
      () => {
        this.updatePulseCards(
          this.state.selectedAttachmentType,
          this.state.selectedCardIds,
        );
      },
    );
  };

  onTogglePivoting = () => {
    this.setState(
      prevState => ({
        ...prevState,
        isPivotingEnabled: !prevState.isPivotingEnabled,
      }),
      () => {
        this.updatePulseCards(
          this.state.selectedAttachmentType,
          this.state.selectedCardIds,
        );
      },
    );
  };

  disableAllCards() {
    const selectedCardIds = new Set();
    this.updatePulseCards(this.state.selectedAttachmentType, selectedCardIds);
    this.setState({ selectedCardIds });
  }

  areAllSelected(allCards, selectedCardSet) {
    return allCards.length === selectedCardSet.size;
  }

  areOnlySomeSelected(allCards, selectedCardSet) {
    return 0 < selectedCardSet.size && selectedCardSet.size < allCards.length;
  }

  render() {
    const { cards } = this.props;
    const {
      isEnabled,
      isFormattingEnabled,
      isPivotingEnabled,
      selectedAttachmentType,
      selectedCardIds,
    } = this.state;

    return (
      <div>
        <Group className={CS.borderTop} position="apart" pt="1.5rem">
          <Group position="left" spacing="0">
            <Text fw="bold">{t`Attach results as files`}</Text>
            <Icon
              name="info"
              className={cx(CS.textMedium, CS.ml1)}
              size={12}
              tooltip={t`Attachments can contain up to 2,000 rows of data.`}
            />
          </Group>
          <Toggle
            aria-label={t`Attach results`}
            value={isEnabled}
            onChange={this.toggleAttach}
          />
        </Group>
        {isEnabled && (
          <div>
            <Box py="1rem">
              <ExportSettingsWidget
                selectedFormat={selectedAttachmentType}
                formats={["csv", "xlsx"]}
                isFormattingEnabled={isFormattingEnabled}
                isPivotingEnabled={isPivotingEnabled}
                canConfigureFormatting={selectedAttachmentType === "csv"}
                canConfigurePivoting={this.canConfigurePivoting()}
                onChangeFormat={this.setAttachmentType}
                onToggleFormatting={this.onToggleFormatting}
                onTogglePivoting={this.onTogglePivoting}
              />
            </Box>
            <div
              className={cx(
                CS.pt1,
                CS.pb2,
                CS.flex,
                CS.justifyBetween,
                CS.alignCenter,
              )}
            >
              <ul className={CS.full}>
                <li
                  className={cx(
                    CS.mb2,
                    CS.pb1,
                    CS.flex,
                    CS.alignCenter,
                    CS.cursorPointer,
                    CS.borderBottom,
                  )}
                >
                  <Checkbox
                    variant="stacked"
                    label={t`Questions to attach`}
                    checked={this.areAllSelected(cards, selectedCardIds)}
                    indeterminate={this.areOnlySomeSelected(
                      cards,
                      selectedCardIds,
                    )}
                    onChange={this.onToggleAll}
                  />
                </li>
                {cards.map(card => (
                  <li key={card.id}>
                    <Checkbox
                      mb="1rem"
                      mr="0.5rem"
                      checked={selectedCardIds.has(card.id)}
                      label={card.name}
                      onChange={() => {
                        this.onToggleCard(card);
                      }}
                    />
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

function getInitialFormattingState(cards) {
  if (cards.length > 0) {
    return cards.some(card => !!card.format_rows);
  }
  return true;
}

function getInitialPivotingState(cards) {
  if (cards.length > 0) {
    return cards.some(card => !!card.pivot_results);
  }
  return false;
}
