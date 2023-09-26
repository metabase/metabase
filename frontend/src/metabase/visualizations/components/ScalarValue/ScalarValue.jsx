/*
 * Shared component for Scalar and SmartScalar to make sure our number presentation stays in sync
 */
/* eslint-disable react/prop-types */
import { useMemo } from "react";
import { t } from "ttag";

import Tooltip from "metabase/core/components/Tooltip";
import { Ellipsified } from "metabase/core/components/Ellipsified";
import Markdown from "metabase/core/components/Markdown";
import {
  ScalarRoot,
  ScalarValueWrapper,
  ScalarTitleContainer,
  ScalarDescriptionContainer,
  ScalarDescriptionIcon,
  ScalarDescriptionPlaceholder,
  ScalarTitleContent,
} from "./ScalarValue.styled";

import { findSize, getMaxFontSize } from "./utils";

export const ScalarWrapper = ({ children }) => (
  <ScalarRoot>{children}</ScalarRoot>
);

const ScalarValue = ({
  value,
  height,
  width,
  gridSize,
  totalNumGridCols,
  fontFamily,
}) => {
  const fontSize = useMemo(
    () =>
      findSize({
        text: value,
        targetHeight: height,
        targetWidth: width,
        fontFamily: fontFamily ?? "Lato",
        fontWeight: 900,
        unit: "rem",
        step: 0.2,
        min: 1,
        max: gridSize ? getMaxFontSize(gridSize.width, totalNumGridCols) : 4,
      }),
    [fontFamily, gridSize, height, totalNumGridCols, value, width],
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
  <ScalarTitleContainer data-testid="scalar-title" lines={lines}>
    {/*
      This is a hacky spacer so that the h3 is centered correctly.
      It needs match the width of the tooltip icon on the other side.
     */}
    {description && description.length > 0 && <ScalarDescriptionPlaceholder />}
    <ScalarTitleContent
      className="fullscreen-normal-text fullscreen-night-text"
      onClick={onClick}
    >
      <Ellipsified tooltip={title} lines={lines} placement="bottom">
        {title}
      </Ellipsified>
    </ScalarTitleContent>
    {description && description.length > 0 && (
      <ScalarDescriptionContainer data-testid="scalar-description">
        <Tooltip
          tooltip={
            <Markdown dark disallowHeading unstyleLinks>
              {description}
            </Markdown>
          }
          maxWidth="22em"
        >
          <ScalarDescriptionIcon name="info_filled" />
        </Tooltip>
      </ScalarDescriptionContainer>
    )}
  </ScalarTitleContainer>
);

export default ScalarValue;
