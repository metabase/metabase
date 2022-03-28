import styled from "@emotion/styled";
import Link from "metabase/core/components/Link";
import TextInput from "metabase/components/TextInput";

export const ModalRoot = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 573px;
  max-height: 90vh;
`;

export const ModalToolbar = styled.div`
  display: flex;
  padding: 1rem 2rem 0;
`;

export const ModalToolbarInput = styled(TextInput)`
  flex: 1 1 auto;

  ${TextInput.Input} {
    height: 2.5rem;
  }
`;

export const ModalToolbarLink = styled(Link)`
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  height: 2.5rem;
  margin-left: 1rem;
`;

export interface ModalBodyProps {
  isTopAligned?: boolean;
}

export const ModalBody = styled.div<ModalBodyProps>`
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  justify-content: ${props => (props.isTopAligned ? "" : "center")};
  margin: 1rem 0 0;
  padding: 1rem 2rem 2rem;
  overflow-y: auto;
`;
