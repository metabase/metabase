import styled from "@emotion/styled";
import { space } from "metabase/styled-components/theme";

export const ModalLayout = styled.div`
  display: flex;
  gap: ${space(2)};
`;

export const ModalPane = styled.div`
  flex: 1;
`;

export const ModalMain = styled.div`
  flex: 2;
`;

export const ModalSection = styled.div`
  margin-bottom: ${space(2)};
`;

export const ModalLabel = styled.label`
  display: block;
  margin-bottom: ${space(1)};
  font-weight: bold;
`;

export const ModalFooter = styled.div`
  display: flex;
  gap: ${space(2)};
  justify-content: end;
`;
