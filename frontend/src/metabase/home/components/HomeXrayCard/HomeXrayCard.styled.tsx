import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import { Icon } from "metabase/ui";

export const CardContainer = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: start;
  padding: 16px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  background-color: #f9fbfc;
  width: 300px;
  height: 130px;
  flex-grow: 0;
  flex-shrink: 0;
  margin: 0 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  overflow: hidden;
`;

export const CardIcon = styled(Icon)`
  background-color: #eef3ff;
  padding: 8px;
  border-radius: 50%;
  color: ${() => color("accent4")};
  flex-shrink: 0;
`;

export const CardTitle = styled.div`
  margin-left: 8px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  text-align: left;
`;

export const CardTitlePrimary = styled.span`
  font-size: 18px;
  font-weight: 600;
  color: var(--mb-color-text-dark);
  line-height: 1.4;
  word-wrap: break-word;
  white-space: normal;
  overflow: hidden;
`;

export const CardTitleSecondary = styled.span`
  font-size: 16px;
  color: var(--mb-color-text-medium);
  margin-top: 4px;
  overflow-wrap: break-word;
  line-height: 1.4;
`;
