import type { ReactNode } from "react";

import { useUniqueId } from "metabase/hooks/use-unique-id";
import { Switch } from "metabase/ui";

import {
  ImageContainer,
  ToggleContainer,
  ToggleLabel,
  ToggleRoot,
} from "./ImageToggle.styled";

export interface ImageToggleProps {
  label: string;
  value: boolean;
  children?: ReactNode;
  onChange: (value: boolean) => void;
}

export const ImageToggle = ({
  label,
  value,
  children,
  onChange,
}: ImageToggleProps): JSX.Element => {
  const toggleId = useUniqueId();

  return (
    <ToggleRoot>
      <ImageContainer>{children}</ImageContainer>
      <ToggleContainer>
        <ToggleLabel htmlFor={toggleId}>{label}</ToggleLabel>
        <Switch
          id={toggleId}
          aria-checked={value}
          checked={value}
          onChange={e => onChange(e.target.checked)}
        />
      </ToggleContainer>
    </ToggleRoot>
  );
};
