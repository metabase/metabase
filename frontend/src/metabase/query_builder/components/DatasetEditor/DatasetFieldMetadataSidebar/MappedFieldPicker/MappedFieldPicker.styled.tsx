import styled from "@emotion/styled";
import { css } from "@emotion/react";
import SelectButton from "metabase/core/components/SelectButton";

export const StyledSelectButton = styled(SelectButton)`
  ${props =>
    props.hasValue &&
    css`
      color: ${props.theme.fn.themeColor("text-white")} !important;
      background-color: ${props.theme.fn.themeColor("brand")};
      border-color: ${props.theme.fn.themeColor("brand")};

      .Icon {
        color: ${props.theme.fn.themeColor("text-white")};
      }
    `};
`;
