import styled from "@emotion/styled";
import Link from "metabase/core/components/Link";
import { color } from "metabase/lib/colors";

export const DisplayLinkCardWrapper = styled.div<{ alignmentSettings: string }>`
  padding: 0.5rem;
  display: flex;
  width: 100%;
  height: 100%;
  pointer-events: all;
  ${props => props.alignmentSettings ?? ""}
`;

export const EditLinkCardWrapper = styled.div`
  padding: 0.5rem;
  display: flex;
  flex-direction: column;
  justify-content: center;
  width: 100%;
  height: 100%;
  pointer-events: all;
`;

export const CardLink = styled(Link)`
  padding: 0.5rem;
  display: flex;
  min-width: 0;
  gap: 0.5rem;
  align-items: center;
  &:hover {
    color: ${color("brand")};
    text-decoration: underline;
  }
`;
