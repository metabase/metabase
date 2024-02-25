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
  background-color: ${color('bg-medium')};
  border-radius: 1rem;
  margin-right: 1rem;
`;

export const Explanation = styled.aside`
  max-width: 32rem;
  margin-bottom: 1rem;
`;

export const CacheAdminButton = styled.button`
  cursor: pointer;
  display: flex;
  flex-flow: row nowrap;
  align-items: center;
  border-radius: 1rem;
`

export const RuleButton = styled(CacheAdminButton)`
  padding: 1rem;
  background-color: ${color('bg-medium')};
  min-width: 20rem;
`;

export const GeneralRuleButton = styled(RuleButton)`
`;

export const RuleValue = styled(CacheAdminButton)`
  margin-left: auto;
  background: ${color('brand')};
  color: ${color('white')};
  padding: 1rem;
`;

export const GeneralRuleValue = styled(RuleValue)`
`;

export const SpecialRule = styled.div`
  display: flex;
  flex-flow: row nowrap;
  align-items: center;
  padding: 1rem;
  min-width: 20rem;
  `

export const SpecialRuleValue = styled(RuleValue)`
  `


export const DatabaseRuleIcon = styled(Icon)`
  margin-right: .5rem;
`;

export const RuleEditor = styled.div`
  display: flex;
  flex-flow: row nowrap;
`


