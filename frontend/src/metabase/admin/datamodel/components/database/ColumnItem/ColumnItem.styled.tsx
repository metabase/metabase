import styled from "@emotion/styled";
import InputBlurChange from "metabase/components/InputBlurChange";
import { color } from "metabase/lib/colors";

interface ColumnItemInputProps {
  variant: "primary" | "secondary";
}

export const ColumnItemInput = styled(InputBlurChange)<ColumnItemInputProps>`
  // border-color: ${color("border")};

  ${InputBlurChange.Field} {
    padding: 0.625rem 0.75rem;
    font-size: 0.875rem;
    width: 100%;

    background-color: ${props =>
      color(props.variant === "primary" ? "white" : "bg-light")};
  }
`;
