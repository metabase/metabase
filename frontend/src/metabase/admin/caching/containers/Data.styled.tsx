import styled from "@emotion/styled";
import type { HTMLAttributes } from "react";

import { color } from "metabase/lib/colors";
import type { ButtonProps as BaseButtonProps } from "metabase/ui";
import { Button, Icon } from "metabase/ui";

type ButtonProps = BaseButtonProps & HTMLAttributes<HTMLButtonElement>;

type ConfigProps = ButtonProps & {
  doesOverrideGeneralConfig?: boolean;
  isBeingEdited?: boolean;
};

export const EditorPanel = styled.div`
  overflow-y: scroll;
  display: flex;
  flex-flow: column nowrap;
  padding: 1.5rem;
  background-color: ${color("white")};
  border: 2px solid ${color("border")};
  &:first-child {
    border-top-left-radius: 1rem;
    border-bottom-left-radius: 1rem;
  }
  &:first-child,
  &:nth-child(2) {
    border-right: none;
  }
  &:last-child {
    border-top-right-radius: 1rem;
    border-bottom-right-radius: 1rem;
  }
`;

export const ConfigPanel = styled(EditorPanel)``;

export const Explanation = styled.aside`
  max-width: 32rem;
  margin-bottom: 1rem;
`;

export const CacheAdminButton = styled(Button)<ButtonProps>`
  cursor: pointer;
  display: flex;
  flex-flow: row nowrap;
  align-items: center;
  padding: 1rem;
  & div {
    flex: 1;
  }
  & span {
    display: flex;
    flex: 1;
    flex-flow: row nowrap;
    justify-content: space-between;
  }
`;

export const Config = styled(CacheAdminButton)`
  padding: 1rem;
  min-width: 20rem;
  font-weight: bold;
`;

export const GeneralConfig = styled(Config)<ConfigProps>`
  border: 1px solid ${color("bg-medium")};
  background-color: ${({ isBeingEdited }) =>
    isBeingEdited ? color("brand") : color("bg-medium")};
  color: ${({ isBeingEdited }) =>
    isBeingEdited ? color("white") : color("text-dark")};
`;

export const Strategy = styled(CacheAdminButton)`
  margin-left: auto;
  background: ${color("brand")};
  color: ${color("white")};
  padding: 0.75rem 1rem;
  font-weight: bold;
`;

export const GeneralStrategy = styled(Strategy)<ConfigProps>`
  background-color: ${({ isBeingEdited }) =>
    isBeingEdited ? color("white") : color("brand")};
  color: ${({ isBeingEdited }) =>
    isBeingEdited ? color("brand") : color("white")};
`;

export const SpecialConfigStyled = styled(CacheAdminButton)<ConfigProps>`
  width: 100%;
  display: flex;
  font-weight: bold;
  flex-flow: row nowrap;
  margin-bottom: 1rem;
  align-items: center;
  // TODO: These shrink vertically when there are too many in the panel
  padding: 1rem;
  min-width: 20rem;
  border: 1px solid ${color("border")};
`;

export const SpecialStrategy = styled(Strategy)<ConfigProps>`
  background-color: ${({ doesOverrideGeneralConfig, isBeingEdited }) =>
    doesOverrideGeneralConfig && !isBeingEdited
      ? color("brand")
      : color("white")};
  color: ${({ doesOverrideGeneralConfig, isBeingEdited }) =>
    doesOverrideGeneralConfig && !isBeingEdited
      ? color("white")
      : color("text-dark")};
`;

export const DatabasesConfigIcon = styled(Icon)`
  margin-right: 0.5rem;
`;

export const Editor = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  width: 100%;
  margin-bottom: 1rem;
  overflow: hidden;
`;

export const TabWrapper = styled.div`
  display: grid;
  grid-template-rows: auto 1fr;
  width: 100%;
`;

export const ClearOverridesButton = styled.button`
  color: ${color("red")};
  margin-top: auto;
  margin-left: auto;
  cursor: pointer;
`;

export const ConfigPanelSection = styled.section`
  margin-bottom: 2rem;
  &:last-child {
    margin-bottom: 0;
  }
`;
