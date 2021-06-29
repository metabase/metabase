import styled from "styled-components";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";

export const Container = styled.div`
  display: flex;
  align-items: center;
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
