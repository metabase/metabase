import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import HomeCard from "metabase/home/homepage/components/HomeCard";
import Icon from "metabase/components/Icon";
import Ellipsified from "metabase/components/Ellipsified";

export const SectionTitle = styled.div`
  display: flex;
  align-items: center;
  color: ${color("text-medium")};
  font-weight: bold;
  margin-bottom: 1.5rem;
`;

export const PopularList = styled.div`
  display: flex;
  gap: 1.5rem;
  flex-wrap: wrap;
`;

export const PopularCard = styled(HomeCard)`
  display: flex;
  align-items: center;
`;

export const PopularIcon = styled(Icon)`
  display: block;
  flex: 0 0 auto;
  color: ${color("brand")};
  width: 1rem;
  height: 1rem;
`;

export const PopularTitle = styled(Ellipsified)`
  color: ${color("text-dark")};
  font-size: 1rem;
  font-weight: bold;
  margin-left: 1rem;
`;
