/* eslint "react/prop-types": "warn" */
/*eslint-disable react/no-danger */
import React, { Component } from "react";
import PropTypes from "prop-types";

import Icon from "metabase/components/Icon.jsx";
import LoadingSpinner from "metabase/components/LoadingSpinner.jsx";
import Tooltip from "metabase/components/Tooltip.jsx";

import { t } from "c-3po";
import cx from "classnames";

export default class PulseCardPreview extends Component {
  constructor(props, context) {
    super(props, context);
  }

  static propTypes = {
    card: PropTypes.object.isRequired,
    cardPreview: PropTypes.object,
    onChange: PropTypes.func.isRequired,
    onRemove: PropTypes.func.isRequired,
    fetchPulseCardPreview: PropTypes.func.isRequired,
    attachmentsEnabled: PropTypes.bool,
    trackPulseEvent: PropTypes.func.isRequired,
  };

  componentWillMount() {
    this.props.fetchPulseCardPreview(this.props.card.id);
  }

  componentWillReceiveProps(nextProps) {
    // if we can't render this card as a pulse, set include_csv = true
    const unrenderablePulseCard =
      nextProps.cardPreview && nextProps.cardPreview.pulse_card_type == null;
    const hasAttachment =
      nextProps.card.include_csv || nextProps.card.include_xls;
    if (unrenderablePulseCard && !hasAttachment) {
      nextProps.onChange({ ...nextProps.card, include_csv: true });
    }
  }

  hasAttachment() {
    const { card } = this.props;
    return card.include_csv || card.include_xls;
  }

  toggleAttachment = () => {
    const { card, onChange } = this.props;
    if (this.hasAttachment()) {
      onChange({ ...card, include_csv: false, include_xls: false });

      this.props.trackPulseEvent("RemoveAttachment");
    } else {
      onChange({ ...card, include_csv: true });

      this.props.trackPulseEvent("AddAttachment", "csv");
    }
  };

  render() {
    let { cardPreview, attachmentsEnabled } = this.props;
    const hasAttachment = this.hasAttachment();
    const isAttachmentOnly =
      attachmentsEnabled &&
      hasAttachment &&
      cardPreview &&
      cardPreview.pulse_card_type == null;
    return (
      <div
        className="relative full"
        style={{
          maxWidth: 379,
        }}
      >
        <div
          className="absolute p2 text-grey-2"
          style={{
            top: 2,
            right: 2,
            background:
              "linear-gradient(to right, rgba(255,255,255,0.2), white, white)",
            paddingLeft: 100,
          }}
        >
          {attachmentsEnabled &&
            !isAttachmentOnly && (
              <Tooltip
                tooltip={
                  hasAttachment
                    ? t`Remove attachment`
                    : t`Attach file with results`
                }
              >
                <Icon
                  name="attachment"
                  size={18}
                  className={cx("cursor-pointer py1 pr1 text-brand-hover", {
                    "text-brand": this.hasAttachment(),
                  })}
                  onClick={this.toggleAttachment}
                />
              </Tooltip>
            )}
          <Icon
            name="close"
            size={18}
            className="cursor-pointer py1 pr1 text-brand-hover"
            onClick={this.props.onRemove}
          />
        </div>
        <div
          className="bordered rounded bg-white scroll-x"
          style={{ display: !cardPreview && "none" }}
        >
          {/* Override backend rendering if pulse_card_type == null */}
          {cardPreview && cardPreview.pulse_card_type == null ? (
            <RenderedPulseCardPreview href={cardPreview.pulse_card_url}>
              <RenderedPulseCardPreviewHeader>
                {cardPreview.pulse_card_name}
              </RenderedPulseCardPreviewHeader>
              <RenderedPulseCardPreviewMessage>
                {isAttachmentOnly
                  ? t`This question will be added as a file attachment`
                  : t`This question won't be included in your Pulse`}
              </RenderedPulseCardPreviewMessage>
            </RenderedPulseCardPreview>
          ) : (
            <div
              dangerouslySetInnerHTML={{
                __html: cardPreview && cardPreview.pulse_card_html,
              }}
            />
          )}
        </div>
        {!cardPreview && (
          <div className="flex-full flex align-center layout-centered pt1">
            <LoadingSpinner className="inline-block" />
          </div>
        )}
      </div>
    );
  }
}

// implements the same layout as in metabase/pulse/render.clj
const RenderedPulseCardPreview = ({ href, children }) => (
  <a
    href={href}
    style={{
      fontFamily: 'Lato, "Helvetica Neue", Helvetica, Arial, sans-serif',
      margin: 16,
      marginBottom: 16,
      display: "block",
      textDecoration: "none",
    }}
    target="_blank"
  >
    {children}
  </a>
);

RenderedPulseCardPreview.propTypes = {
  href: PropTypes.string,
  children: PropTypes.node,
};

// implements the same layout as in metabase/pulse/render.clj
const RenderedPulseCardPreviewHeader = ({ children }) => (
  <table style={{ marginBottom: 8, width: "100%" }}>
    <tbody>
      <tr>
        <td>
          <span
            style={{
              fontFamily:
                'Lato, "Helvetica Neue", Helvetica, Arial, sans-serif',
              fontSize: 16,
              fontWeight: 700,
              color: "rgb(57,67,64)",
              textDecoration: "none",
            }}
          >
            {children}
          </span>
        </td>
        <td style={{ textAlign: "right" }} />
      </tr>
    </tbody>
  </table>
);

RenderedPulseCardPreviewHeader.propTypes = {
  children: PropTypes.node,
};

const RenderedPulseCardPreviewMessage = ({ children }) => (
  <div className="text-grey-4">{children}</div>
);

RenderedPulseCardPreviewMessage.propTypes = {
  children: PropTypes.node,
};
