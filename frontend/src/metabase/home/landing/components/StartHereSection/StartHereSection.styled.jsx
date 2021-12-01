import styled from "styled-components";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";

export const BannerRoot = styled.div`
  display: flex;
  align-items: center;
  padding: 1.5rem;
  border: 1px solid ${color("border")};
  border-radius: 0.5rem;
  background-color: ${color("white")};
`;

export const BannerIconContainer = styled.div`
  display: flex;
  flex: 0 0 auto;
  justify-content: center;
  align-items: center;
  width: 2.5rem;
  height: 2.5rem;
  border: 1px solid ${color("border")};
  border-radius: 50%;
`;

export const BannerIcon = styled(Icon)`
  display: block;
  color: ${color("brand")};
  width: 1rem;
  height: 1rem;
`;

export const BannerContent = styled.div`
  flex: 1 1 auto;
  margin: 0 1rem;
`;

export const BannerTitle = styled.div`
  color: ${color("text-dark")};
  font-weight: 700;
`;

export const BannerDescription = styled.div`
  color: ${color("text-medium")};
  margin-top: 0.5rem;
`;
