// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { Button, type ButtonProps } from "metabase/common/components/Button";
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
  gap: 0.5rem;
`;

interface CollectionHeaderButtonProps extends ButtonProps {
  to?: string;
}

export const CollectionHeaderButton = styled(
  (props: CollectionHeaderButtonProps) => (
    <Button
      {...props}
      onlyIcon={props.onlyIcon ?? true}
      iconSize={props.iconSize ?? 20}
    />
  ),
)<CollectionHeaderButtonProps>`
  padding: 0.25rem 0.5rem;
  height: 2rem;
  width: 2rem;

  &:hover {
    color: var(--mb-color-brand);
    background-color: var(--mb-color-background-tertiary);
  }

  ${Button.Content} {
    height: 100%;
  }
`;
