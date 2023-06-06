import styled from "@emotion/styled";

import { TabButton as BaseTabButton } from "metabase/core/components/TabButton";
import BaseButton from "metabase/core/components/Button";

export const Container = styled.div`
  display: flex;
  align-items: start;
  gap: 1.5rem;
  width: 100%;
`;

export const PlaceholderTab = ({ label }: { label: string }) => (
  <BaseTabButton label={label} value={null} disabled />
);

export const CreateTabButton = styled(BaseButton)`
  border: none;
  padding: 0.25rem;
  margin-bottom: 0.5rem;
`;
