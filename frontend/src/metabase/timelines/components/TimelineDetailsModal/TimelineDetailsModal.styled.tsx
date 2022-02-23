import styled from "@emotion/styled";
import Link from "metabase/core/components/Link";
import TextInput from "metabase/components/TextInput";

export const ModalRoot = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 565px;
  max-height: calc(100vh - 64px);
`;

export const ModalToolbar = styled.div`
  display: flex;
  padding: 1rem 2rem 0;
`;

export const ModalToolbarInput = styled(TextInput)`
  flex: 1 1 auto;
  margin-right: 1rem;

  ${TextInput.Input} {
    height: 2.5rem;
  }
`;

export const ModalToolbarLink = styled(Link)`
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  height: 2.5rem;
`;

export const ModalBody = styled.div`
  flex: 1 1 auto;
  padding: 2rem;
  overflow-y: auto;
`;
