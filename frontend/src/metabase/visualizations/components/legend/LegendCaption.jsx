import React, { ReactNode } from "react";
import Tooltip from "metabase/components/Tooltip";
import Ellipsified from "metabase/components/Ellipsified";
import Icon from "metabase/components/Icon";
import {
  LegendCaptionButtonGroup,
  LegendCaptionDescription,
  LegendCaptionRoot,
  LegendCaptionTitle,
} from "./LegendCaption.styled";

type Props = {
  title: string,
  description?: string,
  actionButtons?: ReactNode,
  onClick?: (event: MouseEvent) => void,
};

const LegendCaption = (props: Props) => {
  const { title, description, actionButtons, onClick } = props;

  return (
    <LegendCaptionRoot>
      <LegendCaptionTitle onClick={onClick}>
        <Ellipsified showTooltip>{title}</Ellipsified>)
        {description && (
          <LegendCaptionDescription>
            <Tooltip tooltip={description} maxWidth="22em">
              <Icon name="info" />
            </Tooltip>
          </LegendCaptionDescription>
        )}
      </LegendCaptionTitle>
      {actionButtons && (
        <LegendCaptionButtonGroup>{actionButtons}</LegendCaptionButtonGroup>
      )}
    </LegendCaptionRoot>
  );
};

export default LegendCaption;
