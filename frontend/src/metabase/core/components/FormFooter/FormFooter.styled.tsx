import { css } from "@emotion/react";
import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

interface FormFooterProps {
  hasTopBorder?: boolean;
}

const FormFooter = styled.div<FormFooterProps>`
  ${props =>
    props.hasTopBorder
      ? css`
          border-top: 1px solid ${color("border")};
          margin-top: 0.5rem;
          padding-top: 1.5rem;
        `
      : null};
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.5rem;
`;

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default FormFooter;
