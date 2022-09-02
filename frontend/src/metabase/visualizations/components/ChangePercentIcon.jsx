/* eslint-disable react/prop-types */
import React from "react";

import { color } from "metabase/lib/colors";
import { formatValue } from "metabase/lib/formatting";
import styled from "@emotion/styled";
import { breakpointMaxSmall } from "metabase/styled-components/theme";
import { space } from "styled-system";
import Icon from "metabase/components/Icon";

const LABEL_MIN_WIDTH = 30;

export const Variation = styled.div`
  color: ${props => props.color};
  display: flex;
  align-items: center;

  ${breakpointMaxSmall} {
    margin: ${space(1)} 0;
  }
`;

const ChangePercentIcon = ({ value, percentage, options }) => {
  const isNegative = percentage < 0;
  const barColor = isNegative ? color("error") : color("success");

  return (
    <div className="flex align-center currentcolor justify-end relative">
      {/* TEXT VALUE */}
      <div
        className="text-ellipsis text-bold text-right flex-full"
        style={{ minWidth: LABEL_MIN_WIDTH }}
      >
        {formatValue(value, { ...options, jsx: true, type: "cell" })}
      </div>
      {/* ARROW WITH VALUE */}
      <Variation color={barColor} style={{ padding: "10px" }}>
        <Icon
          style={{ marginRight: "4px" }}
          size={13}
          name={isNegative ? "arrow_down" : "arrow_up"}
        />
        {percentage}%
      </Variation>
    </div>
  );
};

export default ChangePercentIcon;
