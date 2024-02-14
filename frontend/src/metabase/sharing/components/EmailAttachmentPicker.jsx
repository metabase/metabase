import PropTypes from "prop-types";
import { Component } from "react";
import { t } from "ttag";
import _ from "underscore";

import styled from "@emotion/styled";
import { SegmentedControl } from "metabase/components/SegmentedControl";
import { StackedCheckBox } from "metabase/components/StackedCheckBox";
import Label from "metabase/components/type/Label";
import CheckBox from "metabase/core/components/CheckBox";
import Toggle from "metabase/core/components/Toggle";
import { Select } from "metabase/ui";

const CSV_DELIMITER_OPTIONS = [
  { value: null, label: "Comma (,)" }, // Used by default (when the value is nil)
  { value: ";", label: "Semicolon (;)" },
  { value: "\t", label: "Tab" },
  { value: " ", label: "Space" },
];

const CSV_QUOTE_OPTIONS = [
  { value: null, label: 'Double quote (")' }, // Used by default (when the value is nil)
  { value: "'", label: "Single quote (')" },
];

const DELIMITER_FIELD = "csv_delimiter";

const QUOTE_FIELD = "csv_quote";

const StyledSelect = styled(Select)`
  max-width: 180px;
`;

export default class EmailAttachmentPicker extends Component {
  DEFAULT_ATTACHMENT_TYPE = "csv";

  state = {
    isEnabled: false,
    selectedAttachmentType: this.DEFAULT_ATTACHMENT_TYPE,
    [DELIMITER_FIELD]: null,
    [QUOTE_FIELD]: null,
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
      [DELIMITER_FIELD]: this.csvOptionsForCards(
        DELIMITER_FIELD,
        selectedCards,
      ),
      [QUOTE_FIELD]: this.csvOptionsForCards(QUOTE_FIELD, selectedCards),
    };
  }

  shouldUpdateState(newState, currentState) {
    return (
      (currentState.isEnabled || !newState.isEnabled) &&
      newState.selectedAttachmentType === currentState.selectedAttachmentType &&
      _.isEqual(newState.selectedCardIds, currentState.selectedCardIds)
    );
  }

  isCsv(attachmentType) {
    return attachmentType === "csv";
  }

  isXls(attachmentType) {
    return attachmentType === "xls";
  }

  /*
   * Reaches into the parent component (via setPulse) to update its pulsecard's include_{csv,xls} values
   * based on this component's state.
   */
  updatePulseCards(attachmentType, selectedCardIds) {
    const { pulse, setPulse } = this.props;
    const isXls = this.isXls(attachmentType);
    const isCsv = this.isCsv(attachmentType);

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

  /*
   * Updates the pulse cards csv options (quote and delimiter symbols)
   * The options is one of: 'csv_delimiter' or 'csv_quote'
   */
  updatePulseCardsCsvOption(option, value) {
    const { pulse, setPulse } = this.props;
    const { selectedAttachmentType, selectedCardIds } = this.state;

    if (!this.isCsv(selectedAttachmentType)) {
      return;
    }

    setPulse({
      ...pulse,
      cards: pulse.cards.map(card => {
        card[option] = selectedCardIds.has(card.id) ? value : card[option];
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
   * Gets the csv options (quote and delimiter symbols) from pulse cards
   * The options is one of: 'csv_delimiter' or 'csv_quote'
   */
  csvOptionsForCards(option, cards) {
    const csvCards = cards.filter(c => c.include_csv);
    const res = csvCards[0]?.[option] ?? null;
    return res;
  }

  /*
   * Called when the attachment type toggle (csv/xls) is clicked
   */
  setAttachmentType = newAttachmentType => {
    this.updatePulseCards(newAttachmentType, this.state.selectedCardIds);
  };

  /*
   * Should be called when a csv option is updated
   * The options is one of: 'csv_delimiter' or 'csv_quote'
   */
  setCsvOption = (option, value) => {
    this.setState({ [option]: value });
    this.updatePulseCardsCsvOption(option, value);
  };

  /*
   * Called when the csv delimiter has changed
   */
  setCsvDelimiter = newDelimiter => {
    this.setCsvOption(DELIMITER_FIELD, newDelimiter);
  };

  /*
   * Called when the csv quote has changed
   */
  setCsvQuote = newQuote => {
    this.setCsvOption(QUOTE_FIELD, newQuote);
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
    const { isEnabled, selectedAttachmentType, selectedCardIds } = this.state;
    const csvDelimiter = this.state[DELIMITER_FIELD];
    const csvQuote = this.state[QUOTE_FIELD];

    const isCsv = this.isCsv(selectedAttachmentType);

    return (
      <div>
        <Toggle
          aria-label={t`Attach results`}
          value={isEnabled}
          onChange={this.toggleAttach}
        />

        {isEnabled && (
          <div>
            <div className="my1 flex justify-between">
              <Label className="pt1">{t`File format`}</Label>
              <SegmentedControl
                options={[
                  { name: ".csv", value: "csv" },
                  { name: ".xlsx", value: "xls" },
                ]}
                onChange={this.setAttachmentType}
                value={selectedAttachmentType}
                fullWidth
              />
            </div>
            {isCsv && (
              <>
                <div className="text-bold pt1 flex justify-between align-center">
                  <Label className="pt1">{t`Delimiter symbol`}</Label>
                  <StyledSelect
                    aria-label={t`Delimiter symbol`}
                    value={csvDelimiter}
                    data={CSV_DELIMITER_OPTIONS}
                    onChange={this.setCsvDelimiter}
                  />
                </div>
                <div className="text-bold pt1 pb2 flex justify-between align-center">
                  <Label className="pt1">{t`Quote symbol`}</Label>
                  <StyledSelect
                    aria-label={t`Quote symbol`}
                    value={csvQuote}
                    data={CSV_QUOTE_OPTIONS}
                    onChange={this.setCsvQuote}
                  />
                </div>
              </>
            )}
            <div className="text-bold pt1 pb2 flex justify-between align-center">
              <ul className="full">
                <li className="mb2 pb1 flex align-center cursor-pointer border-bottom">
                  <StackedCheckBox
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
                  <li
                    key={card.id}
                    className="pb2 flex align-center cursor-pointer"
                  >
                    <CheckBox
                      checked={selectedCardIds.has(card.id)}
                      label={card.name}
                      onChange={() => {
                        this.onToggleCard(card);
                      }}
                      className="mr1"
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
