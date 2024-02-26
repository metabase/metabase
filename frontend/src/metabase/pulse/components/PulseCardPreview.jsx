/* eslint "react/prop-types": "warn" */
import PropTypes from "prop-types";
import { Component } from "react";
import { t } from "ttag";

import LoadingSpinner from "metabase/components/LoadingSpinner";
import ExternalLink from "metabase/core/components/ExternalLink";
import Tooltip from "metabase/core/components/Tooltip";
import { color } from "metabase/lib/colors";

import { AttachmentIcon, RemoveIcon } from "./PulseCardPreview.styled";

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

  UNSAFE_componentWillMount() {
    this.props.fetchPulseCardPreview(this.props.card.id);
  }

  UNSAFE_componentWillReceiveProps(nextProps) {
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
    const { card, cardPreview, attachmentsEnabled } = this.props;
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
        {cardPreview ? (
          <div className="flex flex-row justify-between bordered rounded bg-white px1">
            <p style={{ fontWeight: "bold" }}>
              {card.name || cardPreview.pulse_card_name}
            </p>
            <div className="flex flex-row align-center">
              {attachmentsEnabled && !isAttachmentOnly && (
                <Tooltip
                  tooltip={
                    hasAttachment
                      ? t`Remove attachment`
                      : t`Attach file with results`
                  }
                >
                  <AttachmentIcon
                    name="attachment"
                    size={18}
                    hasAttachment={this.hasAttachment()}
                    onClick={this.toggleAttachment}
                  />
                </Tooltip>
              )}
              <RemoveIcon
                name="close"
                onClick={this.props.onRemove}
                style={{
                  marginLeft:
                    attachmentsEnabled && !isAttachmentOnly ? "4px" : 0,
                }}
              />
            </div>
          </div>
        ) : (
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
  <ExternalLink
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
  </ExternalLink>
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
              color: color("text-dark"),
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
  <div className="text-medium">{children}</div>
);

RenderedPulseCardPreviewMessage.propTypes = {
  children: PropTypes.node,
};
