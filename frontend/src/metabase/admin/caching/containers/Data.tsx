import type Database from "metabase-lib/metadata/Database";
import type { CacheConfig } from "./Caching";
import { Radio, Select, SelectItem, Text } from "metabase/ui";
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
import { jt, t } from "ttag";

export const Data = ({
  databases,
  cacheConfigs,
}: {
  databases: Database[];
  cacheConfigs: CacheConfig[];
}) => {
  databases = [...databases, ...databases];
  databases = [...databases, ...databases, ...databases];
  databases = [...databases, ...databases, ...databases];
  // TODO: Use real data
  const columns: SelectItem[] = [
    { label: "Column 1", value: "column1" },
    { label: "Column 2", value: "column2" },
  ];
  const durations: SelectItem[] = [
    { label: "5 minutes", value: "5m" },
    { label: "10 minutes", value: "10m" },
  ]

  return (
    <TabWrapper role="region" aria-label="Data caching settings">
      <Explanation>
        {t`Cache the results of queries to have them display instantly. Here you can choose when cached results should be invalidated. You can set up one rule for all your databases, or apply more specific settings to each database.`}
      </Explanation>
      <RuleEditor role="form">
        <RuleEditorPanel role="group">
          <GeneralRuleButton>
            <DatabaseRuleIcon name="database" />
            {t`Databases`}
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
          <ClearOverridesButton>{t`Clear all overrides`}</ClearOverridesButton>
        </RuleEditorPanel>
        <RuleEditorPanel role="group">
          {/* Make the radio button group name specific to the object whose strategy is being modified? */}
          <Radio.Group
            name="caching-strategy"
            label={
              <Text lh="1rem">{t`When should cached query results be invalidated?`}</Text>
            }
          >
            {/* TODO: Check that 'query' goes with 'when the data updates'. The values correspond to the values in caching.api.clj */}
            <Radio mt=".75rem" value="query" label={t`When the data updates`} />
            <Radio mt=".75rem" value="schedule" label={t`On a schedule`} />
            <Radio mt=".75rem" value="ttl" label={t`When the TTL expires`} />
            <Radio
              mt=".75rem"
              value="duration"
              label={t`On a regular duration`}
            />
            <Radio mt=".75rem" value="nocache" label={t`Don't cache`} />
          </Radio.Group>
          <p>
            {jt`We’ll periodically run ${(
              <code>select max()</code>
            )} on the column selected here to check for new results.`}
          </p>
          <Select data={columns} />
          {/* TODO: I'm not sure this translates well */}
          <p>
            {t`Check for new results every...`}
          </p>
          <Select data={durations} />
        </RuleEditorPanel>
      </RuleEditor>
    </TabWrapper>
  );
};
