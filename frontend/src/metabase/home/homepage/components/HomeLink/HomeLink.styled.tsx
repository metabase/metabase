import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import HomeCard from "../HomeCard";

export const HomeLinkIconContainer = styled.div`
  align-self: flex-start;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 100%;
  border: 1px solid ${color("border")};
  color: ${color("brand")};
`;

export const HomeLinkTitle = styled.div`
  font-size: 14px;
  font-weight: 700;
  margin-bottom: 10px;
`;

export const HomeLinkDescription = styled.div`
  margin-bottom: 10px;
  color: ${color("text-medium")};
`;

export const HomeLinkContent = styled.div`
  display: flex;
  flex-direction: column;
  padding-left: 16px;
  margin-top: 4px;
`;

export const HomeLinkActions = styled.div`
  position: absolute;
  padding: 0.5rem;
  top: 0;
  right: 0;
  display: flex;
`;

export const HomeLinkRoot = styled(HomeCard)`
  position: relative;
  display: flex;
  margin-bottom: 16px;
  && {
    max-width: 100%;
    padding: 16px 24px;
  }

  &:hover ${HomeLinkTitle} {
    color: ${color("brand")};
  }
`;
