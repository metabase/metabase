import styled from "styled-components";
import { color, lighten } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";
import IconButtonWrapper from "metabase/components/IconButtonWrapper";

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

export const EngineCardLogo = styled.img`
  display: block;
  width: 2rem;
  height: 2rem;
`;

export const EngineBannerRoot = styled.div`
  display: flex;
  align-items: center;
  color: ${color("white")};
  padding: 0.5rem 0.75rem;
  border-radius: 0.5rem;
  background-color: ${color("brand")};
`;

export const EngineBannerTitle = styled.div`
  flex: 1 0 auto;
  font-weight: bold;
  line-height: 1.5rem;
`;

export const EngineBannerIcon = styled(Icon)`
  cursor: pointer;
`;
