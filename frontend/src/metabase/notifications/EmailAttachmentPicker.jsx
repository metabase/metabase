import cx from "classnames";
import PropTypes from "prop-types";
import { Component } from "react";
import { t } from "ttag";
import _ from "underscore";

import { ExportSettingsWidget } from "metabase/common/components/ExportSettingsWidget";
import { Toggle } from "metabase/common/components/Toggle";
import CS from "metabase/css/core/index.css";
import { Box, Checkbox, Group, Icon, Text, Tooltip } from "metabase/ui";

function getCardIdPair(card) {
  return card.id + "|" + card.dashboard_card_id;
}

export default class EmailAttachmentPicker extends Component {
  DEFAULT_ATTACHMENT_TYPE = "csv";

  state = {
    isEnabled: false,
    isFormattingEnabled: true,
    isPivotingEnabled: false,
    isAttachmentOnly: false,
    selectedAttachmentType: this.DEFAULT_ATTACHMENT_TYPE,
    selectedCardIds: new Set(),
  };

  static propTypes = {
    pulse: PropTypes.object.isRequired,
    setPulse: PropTypes.func.isRequired,
    cards: PropTypes.array.isRequired,
    allowDownload: PropTypes.bool.isRequired,
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
    return this.props.cards.filter((card) => {
      return card.include_csv || card.include_xls;
    });
  }

  calculateStateFromCards() {
    const selectedCards = this._getCardsWithAttachments();
    const { pulse } = this.props;

    return {
      isEnabled: selectedCards.length > 0,
      selectedAttachmentType:
        this.attachmentTypeFor(selectedCards) || this.DEFAULT_ATTACHMENT_TYPE,
      selectedCardIds: new Set(
        selectedCards.map((card) => getCardIdPair(card)),
      ),
      isFormattingEnabled: getInitialFormattingState(selectedCards),
      isPivotingEnabled: getInitialPivotingState(selectedCards),
      isAttachmentOnly: getInitialAttachmentOnlyState(pulse),
    };
  }

  canConfigurePivoting() {
    return this.props.cards.some((card) => card.display === "pivot");
  }

  canAttachFiles() {
    const { allowDownload } = this.props;
    return allowDownload;
  }

  getAttachmentDisabledReason() {
    if (!this.canAttachFiles()) {
      return t`You don't have permission to download results and therefore cannot attach files to subscriptions.`;
    }
    return null;
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
    const { isFormattingEnabled, isPivotingEnabled, isAttachmentOnly } =
      this.state;

    const isXls = attachmentType === "xlsx",
      isCsv = attachmentType === "csv";

    this.setState({ selectedAttachmentType: attachmentType });

    setPulse({
      ...pulse,
      cards: pulse.cards.map((card) => {
        card.include_csv = selectedCardIds.has(getCardIdPair(card)) && isCsv;
        card.include_xls = selectedCardIds.has(getCardIdPair(card)) && isXls;
        card.format_rows = isCsv && isFormattingEnabled; // Excel always uses formatting
        card.pivot_results = card.display === "pivot" && isPivotingEnabled;
        return card;
      }),
      channels: pulse.channels.map((channel) => ({
        ...channel,
        details: {
          ...channel.details,
          attachment_only: isAttachmentOnly,
        },
      })),
    });
  }

  cardIds() {
    return new Set(this.props.cards.map((card) => getCardIdPair(card)));
  }

  cardIdsToCards(cardIds) {
    const { pulse } = this.props;
    return pulse.cards.filter((card) => cardIds.has(getCardIdPair(card)));
  }

  attachmentTypeFor(cards) {
    if (cards.some((c) => c.include_xls)) {
      return "xlsx";
    } else if (cards.some((c) => c.include_csv)) {
      return "csv";
    } else {
      return null;
    }
  }

  /*
   * Called when the attachment type toggle (csv/xls) is clicked
   */
  setAttachmentType = (newAttachmentType) => {
    this.updatePulseCards(newAttachmentType, this.state.selectedCardIds);
  };

  /*
   * Called when attachments are enabled/disabled at all
   */
  toggleAttach = (includeAttachment) => {
    if (!includeAttachment) {
      this.disableAllCards();
    }

    this.setState({
      isEnabled: includeAttachment,
      isAttachmentOnly: includeAttachment ? this.state.isAttachmentOnly : false,
    });
  };

  /*
   * Called on card selection
   */
  onToggleCard(card) {
    this.setState(({ selectedAttachmentType, selectedCardIds }) => {
      const id = getCardIdPair(card);
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
      (prevState) => ({
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
      (prevState) => ({
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

  onToggleAttachmentOnly = () => {
    this.setState(
      (prevState) => ({
        ...prevState,
        isAttachmentOnly: !prevState.isAttachmentOnly,
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
      isAttachmentOnly,
      selectedAttachmentType,
      selectedCardIds,
    } = this.state;

    const canAttachFiles = this.canAttachFiles();
    const disabledReason = this.getAttachmentDisabledReason();

    return (
      <div>
        <Group
          className={CS.borderTop}
          justify="space-between"
          pt="1.5rem"
          pb="1.5rem"
          opacity={canAttachFiles ? 1 : 0.6}
        >
          <Group position="left" gap="0">
            <Text fw="bold">{t`Attach results as files`}</Text>
            <Icon
              name="info"
              c="gray.6"
              ml="0.5rem"
              size={12}
              tooltip={
                disabledReason ||
                t`Attachments can contain up to 2,000 rows of data.`
              }
            />
          </Group>
          <Tooltip label={disabledReason} disabled={!disabledReason}>
            <Toggle
              aria-label={t`Attach results`}
              value={isEnabled && canAttachFiles}
              onChange={this.toggleAttach}
              disabled={!canAttachFiles}
            />
          </Tooltip>
        </Group>
        {isEnabled && canAttachFiles && (
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
                {cards.map((card) => (
                  <li key={card.id}>
                    <Checkbox
                      mb="1rem"
                      mr="0.5rem"
                      checked={selectedCardIds.has(getCardIdPair(card))}
                      label={card.name}
                      onChange={() => {
                        this.onToggleCard(card);
                      }}
                    />
                  </li>
                ))}
              </ul>
            </div>
            <Group justify="space-between" pt="1rem">
              <Group position="left" gap="0">
                <Text fw="bold">{t`Send only attachments (no charts)`}</Text>
                <Icon
                  name="info"
                  c="gray"
                  ml="0.5rem"
                  size={12}
                  tooltip={t`When enabled, only file attachments will be sent (no email content).`}
                />
              </Group>
              <Toggle
                aria-label={t`Send only attachments`}
                value={isAttachmentOnly}
                onChange={this.onToggleAttachmentOnly}
              />
            </Group>
          </div>
        )}
      </div>
    );
  }
}

function getInitialFormattingState(cards) {
  if (cards.length > 0) {
    return cards.some((card) => !!card.format_rows);
  }
  return true;
}

function getInitialPivotingState(cards) {
  if (cards.length > 0) {
    return cards.some((card) => !!card.pivot_results);
  }
  return false;
}

function getInitialAttachmentOnlyState(pulse) {
  if (pulse && pulse.channels && pulse.channels.length > 0) {
    return pulse.channels.some((channel) => !!channel.details?.attachment_only);
  }
  return false;
}
