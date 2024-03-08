import { css } from "@emotion/react";
import styled from "@emotion/styled";

import IconButtonWrapper from "metabase/components/IconButtonWrapper";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { color } from "metabase/lib/colors";

export const ScrollAwareLoadingAndErrorWrapper = styled(
  LoadingAndErrorWrapper,
)<{ hasScroll?: boolean }>`
  ${props =>
    props.hasScroll &&
    css`
      overflow-y: auto;
    `}
`;

export const ItemPickerRoot = styled.div`
  overflow-y: auto;
`;

export const ItemPickerHeader = styled.div`
  display: flex;
  align-items: center;

  margin-bottom: 1rem;
  padding-bottom: 0.5rem;

  border-bottom: 1px solid ${color("border")};
`;

export const ItemPickerList = styled.div`
  overflow-y: auto;
`;

export const SearchInput = styled.input`
  flex: 1 0 auto;
  border-radius: 8px;
`;

export const SearchToggle = styled(IconButtonWrapper)`
  margin-left: auto;
  padding-left: 1rem;

  color: ${color("text-light")};

  &:hover {
    color: ${color("text-medium")};
  }
`;
