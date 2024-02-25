import styled from "@emotion/styled";
import {color} from "metabase/lib/colors";
import { Icon } from "metabase/ui";

export const ThreePanels = styled.div`
  border: 1px solid #000;
  padding: 1rem;
  display: flex;
  flex-flow: row nowrap;
`;

export const RuleEditorPanel = styled.div`
  display: flex;
  flex-flow: column nowrap;
  padding: 1.5rem;
  background-color: ${color('white')};
  border: 2px solid ${color('border')};
  &:first-child {
    border-top-left-radius: 1rem;
    border-bottom-left-radius: 1rem;
  }
  &:first-child, &:nth-child(2) {
    border-right: none;
  }
  &:last-child {
    border-top-right-radius: 1rem;
    border-bottom-right-radius: 1rem;
  }
`;

export const Explanation = styled.aside`
  max-width: 32rem;
  margin-bottom: 1rem;
`;

export const Button = styled.button`
  cursor: pointer;
  display: flex;
  flex-flow: row nowrap;
  align-items: center;
  border-radius: 1rem;
  padding: 1rem;
`

export const RuleButton = styled(Button)`
  background-color: ${color('bg-medium')};
  min-width: 20rem;
`;

export const GeneralRuleButton = styled(RuleButton)`
  border: 1px solid ${color('bg-medium')};
`;

export const RuleValue = styled(Button)`
  margin-left: auto;
  background: ${color('brand')};
  color: ${color('white')};
  padding: .75rem 1rem;
`;

export const GeneralRuleValue = styled(RuleValue)`
`;

export const SpecialRule = styled.div`
  display: flex;
  flex-flow: row nowrap;
  align-items: center;
  padding: 1rem;
  min-width: 20rem;
  border-radius: 1rem;
  border: 1px solid ${color('border')};
  `

export const SpecialRuleValue = styled(RuleValue)`
  `


export const DatabaseRuleIcon = styled(Icon)`
  margin-right: .5rem;
`;

export const RuleEditor = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  width: 100%;
  margin-bottom: 2rem;
`

export const TabWrapper = styled.div`
  display: grid;
  grid-template-rows: auto 1fr;
  width: 100%;
`

export const ClearOverridesButton = styled.button`
  color: ${color('red')};
  margin-top: auto;
  align-self: flex-end;
  cursor: pointer;
`
