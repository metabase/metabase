import styled from "@emotion/styled";
import InputBlurChange from "metabase/components/InputBlurChange";
import { alpha } from "metabase/lib/colors";

export const FieldNameInput = styled(InputBlurChange)`
  display: block;
  margin-bottom: 0.5rem;
  border: 1px solid ${alpha("accent2", 0.2)};
  border-radius: 0.5rem;
`;
