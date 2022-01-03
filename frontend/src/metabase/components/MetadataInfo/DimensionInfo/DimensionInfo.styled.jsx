import styled from "styled-components";

import _DimensionLabel from "metabase/components/MetadataInfo/DimensionLabel";
import _FieldFingerprintInfo from "metabase/components/MetadataInfo/FieldFingerprintInfo";
import { InfoContainer as _InfoContainer } from "metabase/components/MetadataInfo/MetadataInfo.styled";

export const DimensionLabel = styled(_DimensionLabel)`
  font-size: 0.9em;
`;

export const FieldFingerprintInfo = styled(_FieldFingerprintInfo)`
  font-size: 0.9em;
`;

export const InfoContainer = styled(_InfoContainer)`
  gap: 0.8em;
`;
