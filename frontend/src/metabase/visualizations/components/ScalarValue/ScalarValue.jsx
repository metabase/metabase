/*
 * Shared component for Scalar and SmartScalar to make sure our number presentation stays in sync
 */
/* eslint-disable react/prop-types */
import { useMemo } from "react";
import { t } from "ttag";

import { Icon } from "metabase/core/components/Icon";
import Tooltip from "metabase/core/components/Tooltip";
import Ellipsified from "metabase/core/components/Ellipsified";
import Markdown from "metabase/core/components/Markdown";
import {
  ScalarRoot,
  ScalarValueWrapper,
  ScalarTitleContainer,
  ScalarDescriptionContainer,
  ScalarDescriptionPlaceholder,
  ScalarTitleContent,
} from "./ScalarValue.styled";

import { findSize, getMaxFontSize } from "./utils";

const HORIZONTAL_PADDING = 32;

export const ScalarWrapper = ({ children }) => (
  <ScalarRoot>{children}</ScalarRoot>
);

const ScalarValue = ({
  value,
  width,
  gridSize,
  totalNumGridCols,
  fontFamily,
}) => {
  const fontSize = useMemo(
    () =>
      findSize({
        text: value,
        targetWidth: width - HORIZONTAL_PADDING,
        fontFamily: fontFamily ?? "Lato",
        fontWeight: 900,
        unit: "rem",
        step: 0.2,
        min: 1,
        max: gridSize ? getMaxFontSize(gridSize.width, totalNumGridCols) : 4,
      }),
    [fontFamily, gridSize, totalNumGridCols, value, width],
  );

  return (
    <ScalarValueWrapper
      className="ScalarValue"
      fontSize={fontSize}
      data-testid="scalar-value"
    >
      {value ?? t`null`}
    </ScalarValueWrapper>
  );
};

export const ScalarTitle = ({ lines = 2, title, description, onClick }) => (
  <ScalarTitleContainer>
    {/*
      This is a hacky spacer so that the h3 is centered correctly.
      It needs match the width of the tooltip icon on the other side.
     */}
    {description && description.length > 0 && <ScalarDescriptionPlaceholder />}
    <ScalarTitleContent
      className="fullscreen-normal-text fullscreen-night-text"
      data-testid="scalar-title"
      onClick={onClick}
    >
      <Ellipsified tooltip={title} lines={lines} placement="bottom">
        {title}
      </Ellipsified>
    </ScalarTitleContent>
    {description && description.length > 0 && (
      <ScalarDescriptionContainer className="hover-child">
        <Tooltip
          tooltip={
            <Markdown disallowHeading unstyleLinks>
              {description}
            </Markdown>
          }
          maxWidth="22em"
        >
          <Icon name="info_outline" />
        </Tooltip>
      </ScalarDescriptionContainer>
    )}
  </ScalarTitleContainer>
);

export default ScalarValue;
