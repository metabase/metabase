import { styled } from "metabase/ui/utils";

export const SortableDiv = styled.div<{
  transform: string | undefined;
  transition: string | undefined;
}>`
  transform: ${props => props.transform};
  transition: ${props => props.transition};
`;
