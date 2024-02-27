import type Database from "metabase-lib/metadata/Database";
import { Radio, Text } from "metabase/ui";
import { useState } from "react";
import { t } from "ttag";
import {
  isValidCacheStrategy,
  type CacheConfig
} from "../types";
import {
  ClearOverridesButton,
  ConfigPanel,
  ConfigPanelSection,
  DatabaseRuleIcon,
  Explanation,
  GeneralRuleButton,
  GeneralRuleValue,
  RuleEditor,
  RuleEditorPanel,
  SpecialRule,
  SpecialRuleValue,
  TabWrapper
} from "./Data.styled";

export const Data = ({
  databases,
  databaseConfigurations,
  setDatabaseConfiguration,
  clearOverrides,
}: {
  databases: Database[];
  databaseConfigurations: Map<number, CacheConfig>;
  setDatabaseConfiguration: (databaseId: number, config: CacheConfig) => void;
  clearOverrides: () => void;
}) => {
  // Note that an id of zero is a special case that means that we're setting the general rule for all databases
  const [idOfDatabaseBeingConfigured, setIdOfDatabaseBeingConfigured] =
    useState<number | null>(null);
  const currentConfig =
    idOfDatabaseBeingConfigured !== null
      ? databaseConfigurations.get(idOfDatabaseBeingConfigured)
      : null;

  databases = [...databases, ...databases];
  databases = [...databases, ...databases, ...databases];
  databases = [...databases, ...databases, ...databases];

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
            <GeneralRuleValue onClick={() => setIdOfDatabaseBeingConfigured(0)}>
              {databaseConfigurations.get(0)?.strategy}
            </GeneralRuleValue>
          </GeneralRuleButton>
        </RuleEditorPanel>
        <RuleEditorPanel role="group">
          {databases.map(({ id, name }) => {
            return (
              <SpecialRule key={id}>
                <DatabaseRuleIcon name="database" />
                {name}
                <SpecialRuleValue
                  onClick={() => setIdOfDatabaseBeingConfigured(id)}
                >
                  {
                    (
                      databaseConfigurations.get(id) ??
                      databaseConfigurations.get(0)
                    )?.strategy
                  }
                </SpecialRuleValue>
              </SpecialRule>
            );
          })}
          <ClearOverridesButton
            onClick={() => {
              clearOverrides();
            }}
          >{t`Clear all overrides`}</ClearOverridesButton>
        </RuleEditorPanel>
        {idOfDatabaseBeingConfigured !== null && (
          <ConfigPanel role="group">
            <ConfigPanelSection>
              {/* Make the radio button group name specific to the object whose strategy is being modified? */}
              <Radio.Group
                value={currentConfig?.strategy}
                name={`caching-strategy-for-database-${idOfDatabaseBeingConfigured}`}
                onChange={strategy => {
                  if (!isValidCacheStrategy(strategy)) {
                    console.error("invalid strategy", strategy);
                    return;
                  }
                  setDatabaseConfiguration(idOfDatabaseBeingConfigured, {
                    ...(currentConfig as CacheConfig),
                    strategy: strategy,
                  });
                }}
                label={
                  <Text lh="1rem">{t`When should cached query results be invalidated?`}</Text>
                }
              >
                {/* TODO: Check that 'query' goes with 'when the data updates'. The values correspond to the values in caching.api.clj */}
                {/*
                Add later:
            <Radio mt=".75rem" value="query" label={t`When the data updates`} />
            <Radio mt=".75rem" value="schedule" label={t`On a schedule`} />
              */}
                <Radio
                  mt=".75rem"
                  value="ttl"
                  label={t`When the TTL expires`}
                />
                {/*
            <Radio
              mt=".75rem"
              value="duration"
              label={t`On a regular duration`}
            />
            */}
                <Radio mt=".75rem" value="nocache" label={t`Don't cache`} />
              </Radio.Group>
            </ConfigPanelSection>
            {/*
          <StrategyConfig />
              Add later
          <ConfigPanelSection>
            <p>
              {jt`We’ll periodically run ${(
                <code>select max()</code>
              )} on the column selected here to check for new results.`}
            </p>
            <Select data={columns} />
             TODO: I'm not sure this string translates well
          </ConfigPanelSection>
          <ConfigPanelSection>
            <p>{t`Check for new results every...`}</p>
            <Select data={durations} />
          </ConfigPanelSection>
            */}
          </ConfigPanel>
        )}
      </RuleEditor>
    </TabWrapper>
  );
};
