import styled from "@emotion/styled";

import { Form } from "metabase/forms";
import { color } from "metabase/lib/colors";

export const GoogleForm = styled(Form)`
  margin: 0 1rem;
  max-width: 32.5rem;
`;

export const GoogleFormHeader = styled.h2`
  margin-top: 1rem;
`;

export const GoogleFormCaption = styled.p`
  color: ${color("text-medium")};
`;
