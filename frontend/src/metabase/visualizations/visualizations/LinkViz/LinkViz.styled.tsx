import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Link from "metabase/core/components/Link";

export const DisplayLinkCardWrapper = styled.div`
  padding: 0.5rem;
  display: flex;
  width: 100%;
  height: 100%;
  pointer-events: all;
  align-items: center;
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
  width: 100%;
  height: 100%;
  min-width: 0;
  gap: 0.5rem;
  align-items: center;
  &:hover {
    color: ${color("brand")};
    text-decoration: underline;
  }
`;

export const SearchResultsContainer = styled.div`
  padding-top: 0.5rem;
  padding-bottom: 0.5rem;
  min-width: 20rem;
  overflow-y: auto;

  background-color: ${color("bg-white")};
  line-height: 24px;

  box-shadow: 0 20px 20px ${color("shadow")};
  max-height: 400px;

  border: 1px solid ${color("border")};
  border-radius: 6px;
  box-shadow: 0 7px 20px ${color("shadow")};
  pointer-events: all;
`;

export const EntityEditContainer = styled.div`
  pointer-events: all;
  width: 100%;
  display: flex;
  justify-content: space-between;
  gap: 1rem;
`;
