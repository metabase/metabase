import React from "react";
import styled from "@emotion/styled";
import InputBlurChange from "metabase/components/InputBlurChange";

import { color } from "metabase/lib/colors";

const ChartSettingInputBlueChange = styled(InputBlurChange)`
  font-size: 0.875rem;
  border: 1px solid ${color("border")};
  border-radius: 0.5rem;
  color: ${color("text-dark")};
  padding: 0.625rem 0.75rem;
  display: block;
  width: 100%;
  transition: border 0.3s;
  font-weight: 700;
`;

interface ChartSettingInputProps {
  value: string;
  onChange: (value: string) => void;
  id?: string;
}

const ChartSettingInput = ({
  value,
  onChange,
  ...props
}: ChartSettingInputProps) => (
  <ChartSettingInputBlueChange
    {...props}
    data-testid={props.id}
    value={value}
    onBlurChange={e => onChange(e.target.value)}
  />
);

export default ChartSettingInput;
