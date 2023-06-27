import { styled } from "metabase/ui/utils";
import { space } from "metabase/styled-components/theme";

export const CheckboxLabelRoot = styled.div`
  display: flex;
  align-items: center;
  padding-left: ${space(0)};

  > * {
    padding-left: ${space(0)};
  }
`;
