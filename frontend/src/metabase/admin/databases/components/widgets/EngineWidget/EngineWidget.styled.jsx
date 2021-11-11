import styled from "styled-components";
import { color, lighten } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";
import IconButtonWrapper from "metabase/components/IconButtonWrapper";

export const EngineGalleryRoot = styled.div`
  display: block;
`;

export const EngineList = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1.5rem;
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
    background-color: ${lighten("brand", 0.1)};
  }
`;

export const EngineCardTitle = styled.div`
  color: ${color("text-dark")};
  margin-top: 0.5rem;
`;

export const EngineCardIcon = styled.img`
  display: block;
  width: 2rem;
  height: 2rem;
`;

export const EngineEmptyState = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  min-height: 10rem;
`;

export const EngineEmptyIcon = styled(Icon)`
  color: ${color("text-medium")};
  margin-bottom: 0.5rem;
`;

export const EngineEmptyText = styled.div`
  color: ${color("text-light")};
  font-size: 0.75rem;
  line-height: 1.5rem;
  font-weight: bold;
`;
