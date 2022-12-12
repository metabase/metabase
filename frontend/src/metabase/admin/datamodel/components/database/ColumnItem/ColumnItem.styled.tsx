import styled from "@emotion/styled";
import InputBlurChange from "metabase/components/InputBlurChange";
import { color } from "metabase/lib/colors";
import { inputPadding, inputTypography } from "metabase/core/style/input";

interface ColumnItemInputProps {
  variant: "primary" | "secondary";
}

export const ColumnItemInput = styled(InputBlurChange)<ColumnItemInputProps>`
  ${InputBlurChange.Field} {
    ${inputPadding}
    ${inputTypography}
    width: 100%;
    background-color: ${props =>
      color(props.variant === "primary" ? "white" : "bg-light")};
  }
`;
