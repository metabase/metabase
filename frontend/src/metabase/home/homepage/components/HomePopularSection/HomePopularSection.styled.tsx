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

export const SectionBody = styled.div`
  display: flex;
  gap: 1.5rem;
  flex-wrap: wrap;
`;
