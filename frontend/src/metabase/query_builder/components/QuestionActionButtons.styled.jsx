import styled from "styled-components";
import { color } from "metabase/lib/colors";

export const Container = styled.div`
  display: flex;
  align-items: center;
  column-gap: 0.3rem;
  margin-top: 8px;
`;

export const PrimaryButtonContainer = styled.div`
  display: flex;
  column-gap: 0.5rem;
  padding-right: 1rem;
  border-right: 1px solid ${color("border")};
`;

export const SecondaryButtonContainer = styled.div`
  display: flex;
  column-gap: 0.5rem;
  padding-left: 1rem;

  .Icon {
    color: ${color("text-light")};
  }
`;
