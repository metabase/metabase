import type Database from "metabase-lib/metadata/Database";
import { Icon, Radio, Text } from "metabase/ui";
import { Dispatch, MouseEvent, SetStateAction, useState } from "react";
import { t } from "ttag";
import {
  CacheStrategies,
  CacheStrategy,
  isValidCacheStrategy,
  type CacheConfig,
} from "../types";
import {
  ClearOverridesButton,
  ConfigPanel,
  ConfigPanelSection,
  DatabaseStrategyIcon,
  Explanation,
  GeneralConfig,
  GeneralStrategy,
  SpecialConfigStyled,
  SpecialStrategy,
  Editor,
  EditorPanel,
  TabWrapper,
} from "./Data.styled";
import { color } from "metabase/lib/colors";

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
  const isGeneralConfigBeingEdited = idOfDatabaseBeingConfigured === 0;

  return (
    <TabWrapper role="region" aria-label="Data caching settings">
      <Explanation>
        {t`Cache the results of queries to have them display instantly. Here you can choose when cached results should be invalidated. You can set up one rule for all your databases, or apply more specific settings to each database.`}
      </Explanation>
      <Editor role="form">
        <EditorPanel
          role="group"
          style={{ backgroundColor: color("bg-light") }}
        >
          <GeneralConfig
            variant={isGeneralConfigBeingEdited ? "filled" : "outline"}
            radius="sm"
            animate={false}
            onClick={() => setIdOfDatabaseBeingConfigured(0)}
            isBeingEdited={idOfDatabaseBeingConfigured === 0}
          >
            <DatabaseStrategyIcon name="database" />
            {t`Databases`}
            <GeneralStrategy isBeingEdited={isGeneralConfigBeingEdited}>
              {generalStrategyLabel}
            </GeneralStrategy>
          </GeneralConfig>
        </EditorPanel>
        <EditorPanel role="group">
          {databases.map(database => (
            <SpecialConfig
              database={database}
              databaseConfigurations={databaseConfigurations}
              setDatabaseConfiguration={setDatabaseConfiguration}
              idOfDatabaseBeingConfigured={idOfDatabaseBeingConfigured}
              setIdOfDatabaseBeingConfigured={setIdOfDatabaseBeingConfigured}
              generalStrategy={generalStrategy}
            />
          ))}
          <ClearOverridesButton
            onClick={() => {
              clearAllDatabaseOverrides();
            }}
          >{t`Clear all overrides`}</ClearOverridesButton>
        </EditorPanel>
        <ConfigPanel role="group">
          {idOfDatabaseBeingConfigured !== null && (
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
          )}
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
      </Editor>
    </TabWrapper>
  );
};

export const SpecialConfig = ({
  database,
  databaseConfigurations,
  setDatabaseConfiguration,
  idOfDatabaseBeingConfigured,
  setIdOfDatabaseBeingConfigured,
  generalStrategy,
}: {
  database: Database;
  idOfDatabaseBeingConfigured: number | null;
  databaseConfigurations: Map<number, CacheConfig>;
  setDatabaseConfiguration: (
    databaseId: number,
    config: CacheConfig | null,
  ) => void;
  setIdOfDatabaseBeingConfigured: Dispatch<SetStateAction<number | null>>;
  generalStrategy: CacheStrategy | undefined;
}) => {
  const specificConfigForDB = databaseConfigurations.get(database.id);
  const specificStrategyForDB = specificConfigForDB?.strategy;
  const doesOverrideGeneralConfig =
    specificStrategyForDB && specificStrategyForDB !== generalStrategy;
  const strategyForDB = specificStrategyForDB ?? generalStrategy;
  if (!strategyForDB) throw new Error(t`Invalid strategy "${strategyForDB}"`);
  const strategyLabel = CacheStrategies[strategyForDB];
  const isConfigBeingEdited = idOfDatabaseBeingConfigured === database.id;
  const clearOverride = () => {
    setDatabaseConfiguration(database.id, null);
  };
  return (
    <SpecialConfigStyled
      variant={isConfigBeingEdited ? "filled" : "default"}
      isBeingEdited={isConfigBeingEdited}
      key={database.id}
      onClick={() => {
        setIdOfDatabaseBeingConfigured(database.id);
      }}
      animate={false}
      radius="sm"
    >
      <DatabaseStrategyIcon name="database" />
      {database.name}
      <SpecialStrategy
        radius="sm"
        // TODO: use variant={specificStrategy ? "filled" : "outline"} if possible
        doesOverrideGeneralConfig={doesOverrideGeneralConfig}
        isBeingEdited={isConfigBeingEdited}
        onClick={(e: MouseEvent<HTMLButtonElement>) => {
          if (doesOverrideGeneralConfig) {
            clearOverride();
            e.stopPropagation();
          }
        }}
        animate={false}
      >
        {strategyLabel}
        {doesOverrideGeneralConfig && (
          <Icon style={{ marginLeft: ".5rem" }} name="close" />
        )}
      </SpecialStrategy>
    </SpecialConfigStyled>
  );
};
