import type Database from "metabase-lib/metadata/Database";
import { Icon, Radio, Text } from "metabase/ui";
import { MouseEvent, useState } from "react";
import { t } from "ttag";
import {
  CacheStrategies,
  isValidCacheStrategy,
  type CacheConfig,
} from "../types";
import {
  ClearOverridesButton,
  ConfigPanel,
  ConfigPanelSection,
  DatabaseStrategyIcon,
  Explanation,
  GeneralConfigButton,
  GeneralConfigStrategy,
  StrategyEditor,
  StrategyPanel,
  SpecialConfig,
  SpecialStrategy,
  TabWrapper,
} from "./Data.styled";

export const Data = ({
  databases,
  databaseConfigurations,
  setDatabaseConfiguration,
  clearAllDatabaseOverrides,
}: {
  databases: Database[];
  databaseConfigurations: Map<number, CacheConfig>;
  setDatabaseConfiguration: (
    databaseId: number,
    config: CacheConfig | null,
  ) => void;
  clearAllDatabaseOverrides: () => void;
}) => {
  const generalStrategy = databaseConfigurations.get(0)?.strategy;
  const generalStrategyLabel = generalStrategy
    ? CacheStrategies[generalStrategy]
    : null;

  // Note that an id of zero is a special case that means that we're setting the general rule for all databases
  const [idOfDatabaseBeingConfigured, setIdOfDatabaseBeingConfigured] =
    useState<number | null>(null);
  const currentConfig =
    idOfDatabaseBeingConfigured !== null
      ? databaseConfigurations.get(idOfDatabaseBeingConfigured)
      : null;

  return (
    <TabWrapper role="region" aria-label="Data caching settings">
      <Explanation>
        {t`Cache the results of queries to have them display instantly. Here you can choose when cached results should be invalidated. You can set up one rule for all your databases, or apply more specific settings to each database.`}
      </Explanation>
      <StrategyEditor role="form">
        <StrategyPanel role="group">
          <GeneralConfigButton animate={false} onClick={() => setIdOfDatabaseBeingConfigured(0)}>
            <DatabaseStrategyIcon name="database" />
            {t`Databases`}
            <GeneralConfigStrategy>{generalStrategyLabel}</GeneralConfigStrategy>
          </GeneralConfigButton>
        </StrategyPanel>
        <StrategyPanel role="group">
          {databases.map(db => {
            const specificConfigForDB = databaseConfigurations.get(db.id);
            const specificStrategyForDB = specificConfigForDB?.strategy;
            const doesSpecialStrategyOverride =
              specificStrategyForDB &&
              specificStrategyForDB !== generalStrategy;
            const strategyForDB = specificStrategyForDB ?? generalStrategy;
            if (!strategyForDB)
              throw new Error(t`Invalid strategy "${strategyForDB}"`);
            const strategyLabel = CacheStrategies[strategyForDB];
            if (!strategyLabel)
              throw new Error(
                t`Could not find label for strategy ${strategyForDB}`,
              );
            const isBeingConfigured = idOfDatabaseBeingConfigured === db.id;
            const clearOverride = () => {
              setDatabaseConfiguration(db.id, null);
              setIdOfDatabaseBeingConfigured(null);
            };
            return (
              <SpecialConfig
                variant={isBeingConfigured ? "filled" : "outline"}
                isBeingConfigured={isBeingConfigured}
                key={db.id}
                onClick={() => {
                  setIdOfDatabaseBeingConfigured(db.id);
                }}
                animate={false}
              >
                <DatabaseStrategyIcon name="database" />
                {db.name}
                <SpecialStrategy
                  // TODO: use variant={specificStrategy ? "filled" : "outline"} if possible
                  isOverride={doesSpecialStrategyOverride}
                  isBeingConfigured={isBeingConfigured}
                  onClick={(e: MouseEvent<HTMLButtonElement>) => {
                    if (doesSpecialStrategyOverride) {
                      clearOverride();
                      e.stopPropagation();
                    }
                  }}
                  animate={false}
                >
                  {strategyLabel}
                  {doesSpecialStrategyOverride && (
                    <Icon style={{ marginLeft: ".5rem" }} name="close" />
                  )}
                </SpecialStrategy>
              </SpecialConfig>
            );
          })}
          <ClearOverridesButton
            onClick={() => {
              clearAllDatabaseOverrides();
            }}
          >{t`Clear all overrides`}</ClearOverridesButton>
        </StrategyPanel>
        {idOfDatabaseBeingConfigured !== null && (
          <ConfigPanel role="group">
            <ConfigPanelSection>
              {/* Make the radio button group name specific to the object whose strategy is being modified? */}
              <Radio.Group
                value={currentConfig?.strategy ?? generalStrategy}
                name={`caching-strategy-for-database-${idOfDatabaseBeingConfigured}`}
                onChange={strategy => {
                  if (!isValidCacheStrategy(strategy)) {
                    console.error("invalid strategy", strategy);
                    return;
                  }
                  setDatabaseConfiguration(idOfDatabaseBeingConfigured, {
                    modelType: "database",
                    model_id: idOfDatabaseBeingConfigured,
                    strategy,
                  });
                }}
                label={
                  <Text lh="1rem">{t`When should cached query results be invalidated?`}</Text>
                }
              >
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
      </StrategyEditor>
    </TabWrapper>
  );
};
