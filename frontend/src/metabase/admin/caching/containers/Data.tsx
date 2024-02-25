import type Database from "metabase-lib/metadata/Database";
import type { CacheConfig } from "./Caching";
import {
  GeneralRuleValue,
  DatabaseRuleIcon,
  Explanation,
  RuleEditor,
  RuleEditorPanel,
  GeneralRuleButton,
  SpecialRule,
  SpecialRuleValue,
  TabWrapper,
  ClearOverridesButton,
} from "./Data.styled";
import {Space} from "@mantine/core";

export const Data = ({
  databases,
  cacheConfigs,
}: {
  databases: Database[];
  cacheConfigs: CacheConfig[];
}) => {
  return (
    <TabWrapper role="region" aria-label="Data caching settings">
      <Explanation>
        Cache the results of queries to have them display instantly. Here you
        can choose when cached results should be invalidated. You can set up one
        rule for all your databases, or apply more specific settings to each
        database.
      </Explanation>
      <RuleEditor role="form">
        <RuleEditorPanel role="group">
          <GeneralRuleButton>
            <DatabaseRuleIcon name="database" />
            Databases
            <GeneralRuleValue>Scheduled: weekly</GeneralRuleValue>
          </GeneralRuleButton>
        </RuleEditorPanel>
        <RuleEditorPanel role="group">
          {databases.map(database => (
            <SpecialRule key={database.id}>
              <DatabaseRuleIcon name="database" />
              {database.name}
              <SpecialRuleValue>Scheduled: weekly</SpecialRuleValue>
            </SpecialRule>
          ))}
          <ClearOverridesButton>Clear all overrides</ClearOverridesButton>
        </RuleEditorPanel>
        <RuleEditorPanel role="group">
          {/* Cache controls here */}
        </RuleEditorPanel>
      </RuleEditor>
    </TabWrapper>
  );
};
