import styled from "@emotion/styled";

import Icon from "metabase/components/Icon";

import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const ModalRoot = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1 0 auto;
  height: 60vh;
`;

export const ModalHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.5rem 2rem;
`;

export const ModalTitle = styled.div`
  flex: 1 1 auto;
  color: ${color("text-dark")};
  font-size: 1.25rem;
  line-height: 1.5rem;
  font-weight: bold;
`;

export const ModalBody = styled.div`
  display: flex;
  flex: 1;

  padding: 0 1rem 0 1rem;

  overflow-y: scroll;
`;

export const ModalFooter = styled.div`
  display: flex;
  justify-content: flex-end;

  gap: 1rem;
  padding: 1.5rem 2rem;

  border-top: 1px solid ${color("border")};
`;

export const SearchInputContainer = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  position: relative;

  max-width: 14rem;
  padding: 12px 14px;

  border: 1px solid ${color("border")};
  border-radius: 8px;
`;

export const SearchIcon = styled(Icon)`
  color: ${color("text-light")};
`;

export const SearchInput = styled.input`
  background-color: transparent;
  border: none;

  color: ${color("text-medium")};
  font-weight: 700;

  width: 100%;
  margin-left: 8px;

  &:focus {
    outline: none;
  }

  &::placeholder {
    color: ${color("text-light")};
    font-weight: 700;
  }
`;
