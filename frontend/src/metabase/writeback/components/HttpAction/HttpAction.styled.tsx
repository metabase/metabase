import styled from "@emotion/styled";
import EditableTextBase from "metabase/core/components/EditableText";
import { color, alpha, lighten } from "metabase/lib/colors";

export const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  width: 100%;
  height: 100%;
`;

export const Tab = styled.div`
  flex-grow: 1;
`;

export const PersistentTab = styled.div<{ active: boolean }>`
  flex-grow: 1;
  display: ${props => (props.active ? "block" : "none")};
`;

const BORDER = `1px solid ${color("border")}`;

export const LeftColumn = styled.div`
  display: flex;
  flex-direction: column;

  border-top: ${BORDER};
  border-right: ${BORDER};

  background-color: 1px solid ${color("content")};
`;

export const LeftTabs = styled.div`
  border-right: ${BORDER};
`;

export const RightColumn = styled.div`
  display: flex;
  flex-direction: column;
  border-top: ${BORDER};
`;

export const RightTabs = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-right: ${BORDER};
`;

export const MethodContainer = styled.div`
  border-right: ${BORDER};
`;

export const UrlContainer = styled.div`
  border-right: ${BORDER};
`;

export const BodyContainer = styled.div`
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  background-color: ${color("white")};
  border-right: ${BORDER};
`;

export const Description = styled.div`
  background-color: ${color("white")};
`;

export const EditableText = styled(EditableTextBase)`
  color: ${color("text-light")};
`;
