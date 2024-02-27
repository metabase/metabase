import type Database from "metabase-lib/metadata/Database";
import { Radio, SelectItem, Text } from "metabase/ui";
import { Dispatch, SetStateAction, useState } from "react";
import { t } from "ttag";
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
  TabWrapper,
} from "./Data.styled";
import {
  isValidCacheStrategy,
  type CacheConfig,
  type CacheableModelType,
} from "../types";

export const Data = ({
  databases,
    databaseConfigurations,
  setDatabaseConfiguration,
}: {
  databases: Database[];
  databaseConfigurations: CacheConfig[];
  setDatabaseConfiguration: (databaseId: number, config: CacheConfig) => void;
}) => {
  const [idOfDatabaseBeingConfigured, setIdOfDatabaseBeingConfigured] = useState<number | null>(null);

  databases = [...databases, ...databases];
  databases = [...databases, ...databases, ...databases];
  databases = [...databases, ...databases, ...databases];

  const getConfigIndex = (aTarget: {
    modelType: CacheableModelType;
    modelId: number;
  }) => {
    return cacheConfigs.findIndex(
      config =>
        config.modelType === aTarget.modelType &&
        config.model_id === aTarget.modelId,
    );
  };
  const getConfig = (aTarget: {
    modelType: CacheableModelType;
    modelId: number;
  }) => {
    const index = getConfigIndex(aTarget);
    return index !== -1 ? cacheConfigs[index] : null;
  };


  const rootConfig: { modelType: CacheableModelType; modelId: number } = {
    modelType: "root",
    modelId: 0,
  };

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
            <GeneralRuleValue onClick={() => setTarget(rootConfig)}>
              Scheduled: weekly
            </GeneralRuleValue>
          </GeneralRuleButton>
        </RuleEditorPanel>
        <RuleEditorPanel role="group">
          {databases.map(database => {
            return (
            <SpecialRule key={database.id}>
              <DatabaseRuleIcon name="database" />
              {database.name}
              <SpecialRuleValue
                onClick={() =>
                  setTarget(databaseIdentifier)
                }
              >
                {getConfig(databaseIdentifier)?.strategy}
              </SpecialRuleValue>
            </SpecialRule>
          ))}
          <ClearOverridesButton>{t`Clear all overrides`}</ClearOverridesButton>
        </RuleEditorPanel>
        <ConfigPanel role="group">
          <ConfigPanelSection>
            {/* Make the radio button group name specific to the object whose strategy is being modified? */}
            <Radio.Group
              name="caching-strategy"
              onChange={value => {
                const configIndex = cacheConfigs.findIndex(
                  config =>
                    config.modelType === target.modelType &&
                    config.model_id === target.modelId,
                );
                if (!isValidCacheStrategy(value)) {
                  console.error("invalid strategy", value);
                  return false;
                }
                if (configIndex === -1) {
                  console.error("config not found for", target);
                  return false;
                }
                setCacheConfigs(configs => {
                  configs[configIndex].strategy = value;
                  return configs;
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
              <Radio mt=".75rem" value="ttl" label={t`When the TTL expires`} />
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
          <StrategyConfig />
          {/*
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
      </RuleEditor>
    </TabWrapper>
  );
};
