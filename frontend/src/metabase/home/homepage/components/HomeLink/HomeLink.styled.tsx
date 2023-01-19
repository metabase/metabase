import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import HomeCard from "../HomeCard";

export const HomeLinkRoot = styled(HomeCard)`
  position: relative;
  display: flex;
  padding: 16px 24px;
  margin-bottom: 16px;
  && {
    max-width: 100%;
  }
`;

export const HomeLinkIconContainer = styled.div`
  align-self: flex-start;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 100%;
  border: 1px solid ${color("border")};
`;

export const HomeLinkContent = styled.div`
  display: flex;
  flex-direction: column;
  padding-left: 16px;
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

export const HomeLinkActions = styled.div`
  position: absolute;
  top: 0;
  right: 0;
  display: flex;
`;
