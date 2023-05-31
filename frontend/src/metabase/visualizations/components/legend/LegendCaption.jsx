import PropTypes from "prop-types";
import { iconPropTypes } from "metabase/components/Icon";
import Tooltip from "metabase/core/components/Tooltip";
import Markdown from "metabase/core/components/Markdown";
import Ellipsified from "metabase/core/components/Ellipsified";
import LegendActions from "./LegendActions";
import {
  LegendCaptionRoot,
  LegendDescriptionIcon,
  LegendLabel,
  LegendLabelIcon,
  LegendRightContent,
} from "./LegendCaption.styled";

const propTypes = {
  className: PropTypes.string,
  title: PropTypes.string,
  description: PropTypes.string,
  icon: PropTypes.shape(iconPropTypes),
  actionButtons: PropTypes.node,
  onSelectTitle: PropTypes.func,
};

const LegendCaption = ({
  className,
  title,
  description,
  icon,
  actionButtons,
  onSelectTitle,
}) => {
  return (
    <LegendCaptionRoot className={className} data-testid="legend-caption">
      {icon && <LegendLabelIcon {...icon} />}
      <LegendLabel
        className="fullscreen-normal-text fullscreen-night-text"
        onClick={onSelectTitle}
      >
        <Ellipsified>{title}</Ellipsified>
      </LegendLabel>
      <LegendRightContent>
        {description && (
          <Tooltip
            tooltip={
              <Markdown disallowHeading unstyleLinks>
                {description}
              </Markdown>
            }
            maxWidth="22em"
          >
            <LegendDescriptionIcon className="hover-child hover-child--smooth" />
          </Tooltip>
        )}
        {actionButtons && <LegendActions>{actionButtons}</LegendActions>}
      </LegendRightContent>
    </LegendCaptionRoot>
  );
};

LegendCaption.propTypes = propTypes;

export default LegendCaption;
