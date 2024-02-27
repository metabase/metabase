import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import { Button, Icon } from "metabase/ui";
import type { ButtonProps as BaseButtonProps } from "metabase/ui";
import type { HTMLAttributes } from "react";

type ButtonProps = BaseButtonProps & HTMLAttributes<HTMLButtonElement>;

type StrategyButtonProps = ButtonProps & {
  isOverride?: boolean;
  isBeingConfigured?: boolean;
};

export const StrategyEditorPanel = styled.div`
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

export const ConfigPanel = styled(StrategyEditorPanel)``;

export const Explanation = styled.aside`
  max-width: 32rem;
  margin-bottom: 1rem;
`;

export const CacheAdminButton = styled(Button)<ButtonProps>`
  cursor: pointer;
  display: flex;
  flex-flow: row nowrap;
  align-items: center;
  border-radius: 1rem;
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

export const StrategyButton = styled(CacheAdminButton)`
  background-color: ${color("bg-medium")};
  min-width: 20rem;
  font-weight: bold;
`;

export const GeneralConfigButton = styled(StrategyButton)`
  border: 1px solid ${color("bg-medium")};
`;

export const Strategy = styled(CacheAdminButton)`
  margin-left: auto;
  background: ${color("brand")};
  color: ${color("white")};
  padding: 0.75rem 1rem;
  font-weight: bold;
`;

export const GeneralConfigStrategy = styled(Strategy)``;

export const SpecialConfig = styled(CacheAdminButton)<StrategyButtonProps>`
  width: 100%;
  display: flex;
  font-weight: bold;
  flex-flow: row nowrap;
  margin-bottom: 1rem;
  align-items: center;
  padding: 1rem;
  min-width: 20rem;
  border-radius: 1rem;
  border: 1px solid ${color("border")};
`;

export const SpecialStrategy = styled(Strategy)<StrategyButtonProps>`
  background-color: ${({ isOverride, isBeingConfigured }) =>
    isOverride && !isBeingConfigured ? color("brand") : color("white")};
  color: ${({ isOverride, isBeingConfigured }) =>
    isOverride && !isBeingConfigured ? color("white") : color("text-dark")};
`;

export const DatabaseStrategyIcon = styled(Icon)`
  margin-right: 0.5rem;
`;

export const StrategyEditor = styled.div`
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
