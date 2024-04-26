/*
 * Shared component for Scalar and SmartScalar to make sure our number presentation stays in sync
 */
/* eslint-disable react/prop-types */
import cx from "classnames";
import { useMemo } from "react";

import { useMetabaseTheme } from "embedding-sdk";
import { Ellipsified } from "metabase/core/components/Ellipsified";
import Markdown from "metabase/core/components/Markdown";
import Tooltip from "metabase/core/components/Tooltip";
import DashboardS from "metabase/css/dashboard.module.css";
import QueryBuilderS from "metabase/css/query_builder.module.css";
import EmbedFrameS from "metabase/public/components/EmbedFrame/EmbedFrame.module.css";
import { Title } from "metabase/ui";

import {
  ScalarRoot,
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
  const theme = useMetabaseTheme();
  const valueTheme = theme.other?.smartScalar?.value;

  const fontSize = useMemo(() => {
    return findSize({
      text: value,
      targetHeight: height,
      targetWidth: width,
      fontFamily: fontFamily ?? "Lato",
      fontWeight: 700,
      unit: "rem",
      step: 0.2,
      min: 1,
      max: gridSize ? getMaxFontSize(gridSize.width, totalNumGridCols) : 4,
    });
  }, [fontFamily, gridSize, height, totalNumGridCols, value, width]);

  return (
    <Title
      h={1}
      display="inline"
      fontSize={valueTheme?.fontSize ?? fontSize}
      // TODO! is there a better way to do this?
      style={{ cursor: "pointer", ...valueTheme }}
      className={cx(DashboardS.ScalarValue, QueryBuilderS.ScalarValue)}
      data-testid="scalar-value"
    >
      {value ?? theme`null`}
    </Title>
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
      className={cx(
        DashboardS.fullscreenNormalText,
        DashboardS.fullscreenNightText,
        EmbedFrameS.fullscreenNightText,
      )}
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
