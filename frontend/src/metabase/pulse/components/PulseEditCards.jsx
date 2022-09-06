/* eslint-disable react/prop-types */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import cx from "classnames";

import PulseCardPreview from "./PulseCardPreview";

import QuestionSelect from "metabase/containers/QuestionSelect";

// import Query from "metabase/lib/query";
import * as MetabaseAnalytics from "metabase/lib/analytics";

import { color } from "metabase/lib/colors";
import { CardNotice } from "./PulseEditCards.styled";

const SOFT_LIMIT = 10;
const HARD_LIMIT = 25;
const TABLE_MAX_ROWS = 20;
const TABLE_MAX_COLS = 10;

function isAutoAttached(cardPreview) {
  return (
    cardPreview &&
    cardPreview.pulse_card_type === "table" &&
    (cardPreview.row_count > TABLE_MAX_ROWS ||
      cardPreview.col_count > TABLE_MAX_COLS)
  );
}

export default class PulseEditCards extends Component {
  constructor(props) {
    super(props);
    this.state = {};
  }

  static propTypes = {
    pulse: PropTypes.object.isRequired,
    pulseId: PropTypes.number,
    cardPreviews: PropTypes.object.isRequired,
    fetchPulseCardPreview: PropTypes.func.isRequired,
    setPulse: PropTypes.func.isRequired,
    attachmentsEnabled: PropTypes.bool,
  };
  static defaultProps = {};

  setCard(index, card) {
    const { pulse } = this.props;
    this.props.setPulse({
      ...pulse,
      cards: [
        ...pulse.cards.slice(0, index),
        card,
        ...pulse.cards.slice(index + 1),
      ],
    });
  }

  trackPulseEvent = (eventName, eventValue) => {
    MetabaseAnalytics.trackStructEvent(
      this.props.pulseId ? "PulseEdit" : "PulseCreate",
      eventName,
      eventValue,
    );
  };

  addCard(index, cardId) {
    this.setCard(index, { id: cardId, include_csv: false, include_xls: false });
    this.trackPulseEvent("AddCard", index);
  }

  removeCard(index) {
    const { pulse } = this.props;
    this.props.setPulse({
      ...pulse,
      cards: [...pulse.cards.slice(0, index), ...pulse.cards.slice(index + 1)],
    });

    this.trackPulseEvent("RemoveCard", index);
  }

  getNotices(card, cardPreview, index) {
    const showSoftLimitWarning = index === SOFT_LIMIT;
    const notices = [];
    const hasAttachment =
      isAutoAttached(cardPreview) ||
      (this.props.attachmentsEnabled &&
        card &&
        (card.include_csv || card.include_xls));
    if (hasAttachment) {
      notices.push({
        head: t`Attachment`,
        body: (
          <AttachmentWidget
            card={card}
            onChange={card => this.setCard(index, card)}
            trackPulseEvent={this.trackPulseEvent}
          />
        ),
      });
    }
    if (cardPreview) {
      if (isAutoAttached(cardPreview)) {
        notices.push({
          type: "warning",
          head: t`Heads up`,
          body: t`We'll show the first 10 rows of this table in your Pulse. If you email this, we'll add a file attachment with all columns and up to 2,000 rows.`,
        });
      }
      if (cardPreview.pulse_card_type == null && !hasAttachment) {
        notices.push({
          type: "warning",
          head: t`Heads up`,
          body: t`Raw data questions can only be included as email attachments`,
        });
      }
    }
    if (showSoftLimitWarning) {
      notices.push({
        type: "warning",
        head: t`Looks like this pulse is getting big`,
        body: t`We recommend keeping pulses small and focused to help keep them digestible and useful to the whole team.`,
      });
    }
    return notices;
  }

  renderCardNotices(card, index) {
    const cardPreview = card && this.props.cardPreviews[card.id];
    const notices = this.getNotices(card, cardPreview, index);
    if (notices.length > 0) {
      return (
        <div className="absolute" style={{ width: 400, marginLeft: 420 }}>
          {notices.map((notice, index) => (
            <CardNotice key={index} isWarning={notice.type === "warning"}>
              <h3 className="mb1">{notice.head}</h3>
              <div className="h4">{notice.body}</div>
            </CardNotice>
          ))}
        </div>
      );
    }
  }

  render() {
    const { pulse, cardPreviews } = this.props;

    const pulseCards = pulse ? pulse.cards.slice() : [];
    if (pulseCards.length < HARD_LIMIT) {
      pulseCards.push(null);
    }

    return (
      <div className="py1">
        <h2>{t`Pick your data`}</h2>
        <p className="mt1 h4 text-bold text-medium">
          {t`Choose questions you'd like to send in this pulse`}.
        </p>
        <ol className="my3">
          {pulseCards.map((card, index) => (
            <li key={index} className="my1">
              {index === SOFT_LIMIT && (
                <div
                  className="my4 ml3"
                  style={{
                    width: 375,
                    borderTop: `1px dashed ${color("border")}`,
                  }}
                />
              )}
              <div className="flex align-top">
                <div className="flex align-top" style={{ width: 400 }}>
                  <span className="h3 text-bold mr1 mt2">{index + 1}.</span>
                  {card ? (
                    <PulseCardPreview
                      card={card}
                      cardPreview={cardPreviews[card.id]}
                      onChange={this.setCard.bind(this, index)}
                      onRemove={this.removeCard.bind(this, index)}
                      fetchPulseCardPreview={this.props.fetchPulseCardPreview}
                      attachmentsEnabled={
                        this.props.attachmentsEnabled &&
                        !isAutoAttached(cardPreviews[card.id])
                      }
                      trackPulseEvent={this.trackPulseEvent}
                    />
                  ) : (
                    <QuestionSelect
                      onChange={questionId => this.addCard(index, questionId)}
                      className="flex-full"
                      // TODO: reimplement CardPicker's warnings for unsuitable cards
                      // attachmentsEnabled={this.props.attachmentsEnabled}
                    />
                  )}
                </div>
                {this.renderCardNotices(card, index)}
              </div>
            </li>
          ))}
        </ol>
      </div>
    );
  }
}

const ATTACHMENT_TYPES = ["csv", "xls"];

const AttachmentWidget = ({ card, onChange, trackPulseEvent }) => (
  <div>
    {ATTACHMENT_TYPES.map(type => (
      <span
        key={type}
        className={cx("text-brand-hover cursor-pointer mr1", {
          "text-brand": card["include_" + type],
        })}
        onClick={() => {
          const newCard = { ...card };
          for (const attachmentType of ATTACHMENT_TYPES) {
            newCard["include_" + attachmentType] = type === attachmentType;
          }

          trackPulseEvent("AttachmentTypeChanged", type);
          onChange(newCard);
        }}
      >
        {"." + type}
      </span>
    ))}
  </div>
);

AttachmentWidget.propTypes = {
  card: PropTypes.object.isRequired,
  onChange: PropTypes.func.isRequired,
  trackPulseEvent: PropTypes.func.isRequired,
};
