import React from "react";
import Tooltip from "metabase/components/Tooltip";
import Ellipsified from "metabase/components/Ellipsified";
import {
  LegendCaptionIcon,
  LegendCaptionRoot,
  LegendCaptionTitle,
} from "./LegendCaption.styled";

type Props = {
  className?: string,
  title: string,
  description?: string,
  onTitleSelect?: (event: MouseEvent) => void,
};

const LegendCaption = (props: Props) => {
  const { className, title, description, onTitleSelect } = props;

  return (
    <LegendCaptionRoot className={className}>
      <LegendCaptionTitle onClick={onTitleSelect}>
        <Ellipsified>{title}</Ellipsified>
        {description && (
          <Tooltip tooltip={description} maxWidth="22em">
            <LegendCaptionIcon />
          </Tooltip>
        )}
      </LegendCaptionTitle>
    </LegendCaptionRoot>
  );
};

export default LegendCaption;
