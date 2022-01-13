import styled from "styled-components";

import { color } from "metabase/lib/colors";
import Button from "metabase/components/Button";

export const Root = styled.div``;

export const Container = styled.div`
  padding: 1rem;
  width: 100%;
`;

export const OptionsGrouping = styled.li`
  display: flex;
  flex-direction: column;
`;

export const Divider = styled.div`
  border-bottom: 1px solid ${color("border")};
  margin: 0.25rem 0;
  width: calc(100% - 1.5rem);
  align-self: center;
`;

export const ItemButton = styled.button`
  font-weight: bold;
  text-align: left;
  width: 100%;
  padding: 0.5em 1rem;
  margin: 0.1rem 0;
  border-radius: 0.25rem;
  font-size: 0.9rem;

  &:hover,
  &:focus {
    color: ${color("white")};
    background-color: ${color("brand")};
  }
`;
