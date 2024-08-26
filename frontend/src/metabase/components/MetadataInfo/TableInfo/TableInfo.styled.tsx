import styled from "@emotion/styled";

import {
  Container,
  InfoContainer as _InfoContainer,
} from "metabase/components/MetadataInfo/MetadataInfo.styled";

export const MetadataContainer = styled(Container)`
  font-size: 0.9em;
  overflow: hidden;
`;

export const InfoContainer = styled(_InfoContainer)`
  gap: 0.2em;
`;
