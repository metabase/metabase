import styled from "styled-components";
import { space } from "metabase/styled-components/theme";
import FormMessage from "metabase/components/form/FormMessage";

export const AlertModalFooter = styled.div`
  display: flex;
  justify-content: right;
  align-items: center;
  margin-top: ${space(3)};
`;

export const AlertModalMessage = styled(FormMessage)`
  margin-left: -${space(2)};
  margin-right: -${space(2)};
`;
