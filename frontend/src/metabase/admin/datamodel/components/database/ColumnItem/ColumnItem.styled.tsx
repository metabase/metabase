import styled from "@emotion/styled";
import InputBlurChange from "metabase/components/InputBlurChange";
import { color } from "metabase/lib/colors";

interface ColumnItemInputProps {
  variant: "primary" | "secondary";
}

export const ColumnItemInput = styled(InputBlurChange)<ColumnItemInputProps>`
  border-color: ${color("border")};

  background-color: ${props =>
    color(props.variant === "primary" ? "white" : "bg-light")};
`;
