import styled from "@emotion/styled";
import InputBlurChange from "metabase/components/InputBlurChange";

interface ColumnItemInputProps {
  variant: "primary" | "secondary";
}

export const ColumnItemInput = styled(InputBlurChange)<ColumnItemInputProps>`
  width: auto;
`;
