import React, { ReactNode } from "react";
import Tooltip from "metabase/components/Tooltip";
import Ellipsified from "metabase/components/Ellipsified";
import {
  LegendCaptionButtonGroup,
  LegendCaptionIcon,
  LegendCaptionRoot,
  LegendCaptionTitle,
} from "./LegendCaption.styled";

type Props = {
  className?: string,
  title: string,
  description?: string,
  actionButtons?: ReactNode,
  onClick?: (event: MouseEvent) => void,
};

const LegendCaption = (props: Props) => {
  const { className, title, description, actionButtons, onClick } = props;

  return (
    <LegendCaptionRoot className={className}>
      <LegendCaptionTitle onClick={onClick}>
        <Ellipsified>{title}</Ellipsified>
        {description && (
          <Tooltip tooltip={description} maxWidth="22em">
            <LegendCaptionIcon />
          </Tooltip>
        )}
      </LegendCaptionTitle>
      {actionButtons && (
        <LegendCaptionButtonGroup>{actionButtons}</LegendCaptionButtonGroup>
      )}
    </LegendCaptionRoot>
  );
};

export default LegendCaption;
