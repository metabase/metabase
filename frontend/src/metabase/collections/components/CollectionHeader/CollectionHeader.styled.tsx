import styled from "@emotion/styled";
import Button from "metabase/core/components/Button";
import { color } from "metabase/lib/colors";
import { breakpointMinSmall } from "metabase/styled-components/theme";

export const HeaderRoot = styled.div`
  display: flex;
  justify-content: space-between;
  flex-direction: column;
  margin-bottom: 2rem;
  padding-top: 0.25rem;

  ${breakpointMinSmall} {
    align-items: center;
    flex-direction: row;
    padding-top: 0.5rem;
  }
`;

export const HeaderActions = styled.div`
  display: flex;
  margin-top: 0.5rem;
  align-self: start;
`;

interface CollectionHeaderButtonProps {
  to: string;
}

export const CollectionHeaderButton = styled(
  Button,
)<CollectionHeaderButtonProps>`
  padding: 0.5rem 0.75rem;
  height: 2.5rem;

  &:hover {
    color: ${color("brand")};
    background-color: ${color("bg-medium")};
  }

  ${Button.Content} {
    height: 100%;
  }
`;

CollectionHeaderButton.defaultProps = {
  onlyIcon: true,
  iconSize: 16,
};
