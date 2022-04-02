import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";
import Ellipsified from "metabase/components/Ellipsified";
import HomeCard from "../HomeCard";

export const ModelCard = styled(HomeCard)`
  display: flex;
  align-items: center;
`;

export const ModelIcon = styled(Icon)`
  display: block;
  flex: 0 0 auto;
  color: ${color("brand")};
  width: 1rem;
  height: 1rem;
`;

export const ModelTitle = styled(Ellipsified)`
  color: ${color("text-dark")};
  font-size: 1rem;
  font-weight: bold;
  margin-left: 1rem;
`;
