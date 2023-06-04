import styled from "@emotion/styled";

import {
  TabButton as BaseTabButton,
  RenameableTabButtonProps,
} from "metabase/core/components/TabButton";
import BaseButton from "metabase/core/components/Button";

export const Container = styled.div`
  display: flex;
  align-items: start;
  gap: 1.5rem;
  width: 100%;
`;

const _PlaceholderTab = styled(BaseTabButton)`
  padding-top: 0;
  padding-bottom: 0.5rem;
`;
export const PlaceholderTab = ({ label }: { label: string }) => (
  <_PlaceholderTab label={label} value={null} disabled />
);

// Manually styling this component because `styled` doesn't work with generics
export const Tab = <T,>(props: RenameableTabButtonProps<T>) => (
  <BaseTabButton.Renameable<T>
    style={{ paddingTop: 0, paddingBottom: "0.5rem" }}
    {...props}
  />
);

export const CreateTabButton = styled(BaseButton)`
  border: none;
`;
