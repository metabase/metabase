import styled from "@emotion/styled";

import _FieldSemanticTypeLabel from "metabase/components/MetadataInfo/FieldSemanticTypeLabel";
import _FieldFingerprintInfo from "metabase/components/MetadataInfo/FieldFingerprintInfo";
import { InfoContainer as _InfoContainer } from "metabase/components/MetadataInfo/MetadataInfo.styled";

export const FieldSemanticTypeLabel = styled(_FieldSemanticTypeLabel)`
  font-size: 0.9em;
`;

export const FieldFingerprintInfo = styled(_FieldFingerprintInfo)`
  font-size: 0.9em;
`;

export const InfoContainer = styled(_InfoContainer)`
  gap: 0.8em;
`;
