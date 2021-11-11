import styled from "styled-components";
import { color, lighten } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";
import IconButtonWrapper from "metabase/components/IconButtonWrapper";
import Button from "metabase/components/Button";

export const EngineGalleryRoot = styled.div`
  display: block;
`;

export const EngineList = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1.5rem;
  margin: 1.5rem 0;
`;

export const EngineCard = styled(IconButtonWrapper)`
  flex: 1 1 auto;
  flex-direction: column;
  height: 5.375rem;
  padding: 1rem;
  border: 1px solid ${color("bg-medium")};
  background-color: ${color("white")};

  &:hover {
    border-color: ${color("brand")};
    background-color: ${lighten("brand", 0.6)};
  }
`;

export const EngineCardTitle = styled.div`
  color: ${color("text-dark")};
  margin-top: 0.5rem;
`;

export const EngineCardIcon = styled(Icon)`
  color: ${color("text-medium")};
  width: ${props => (props.img ? "2rem" : "1rem")};
  height: ${props => (props.img ? "2rem" : "1rem")};
  padding: ${props => (props.img ? "" : "0.5rem")};
`;

export const EngineEmptyState = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  min-height: 12.25rem;
  margin: 1.5rem 0;
`;

export const EngineEmptyIcon = styled(Icon)`
  color: ${color("text-medium")};
  margin-bottom: 0.5rem;
`;

export const EngineEmptyText = styled.div`
  color: ${color("text-light")};
  font-weight: bold;
`;

export const EngineExpandButton = styled(Button)`
  width: 100%;
`;

export const EngineInfoRoot = styled.div`
  display: flex;
  align-items: center;
  color: ${color("white")};
  padding: 0.75rem;
  border-radius: 0.5rem;
  border: 1px solid ${color("brand")};
  background-color: ${color("brand")};
`;

export const EngineInfoTitle = styled.div`
  flex: 1 0 auto;
  font-size: 1rem;
  font-weight: bold;
`;

export const EngineInfoIcon = styled(Icon)`
  cursor: pointer;
`;
