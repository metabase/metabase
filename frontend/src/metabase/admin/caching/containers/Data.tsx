import type { Dispatch, MouseEvent, SetStateAction } from "react";
import { useState } from "react";
import { t } from "ttag";

import { color } from "metabase/lib/colors";
import type { ButtonProps } from "metabase/ui";
import { Icon, Radio, Text } from "metabase/ui";
import type Database from "metabase-lib/metadata/Database";

import type {
  CacheConfig,
  CacheStrategy,
  DBConfigSetter,
  GetConfigByModelId,
} from "../types";
import { CacheStrategyTypes, isValidCacheStrategyType } from "../types";

import {
  ClearOverridesButton,
  ConfigPanel,
  ConfigPanelSection,
  DatabasesConfigIcon,
  Editor,
  EditorPanel,
  Explanation,
  GeneralConfig,
  GeneralStrategy,
  SpecialConfigStyled,
  SpecialStrategy,
  TabWrapper,
} from "./Data.styled";

export const Data = ({
  databases,
  dbConfigs,
  setDBConfig,
  clearDBOverrides,
}: {
  databases: Database[];
  dbConfigs: GetConfigByModelId;
  setDBConfig: DBConfigSetter;
  clearDBOverrides: () => void;
}) => {
  const generalStrategy = dbConfigs.get(0)?.strategy;
  const generalStrategyLabel = generalStrategy
    ? CacheStrategyTypes[generalStrategy.type]
    : null;

  // if targetId is 0, the general strategy is being configured
  const [targetId, setTargetId] = useState<number | null>(null);
  const currentConfig = targetId !== null ? dbConfigs.get(targetId) : null;
  const editingGeneralConfig = targetId === 0;

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
            {...getButtonProps({
              shouldHighlightButton: editingGeneralConfig,
            })}
            onClick={() => setTargetId(0)}
          >
            <DatabasesConfigIcon name="database" />
            {t`Databases`}
            <GeneralStrategy
              {...getButtonProps({
                shouldHighlightButton: !editingGeneralConfig,
              })}
            >
              {generalStrategyLabel}
            </GeneralStrategy>
          </GeneralConfig>
        </EditorPanel>
        <EditorPanel role="group">
          {databases.map(db => (
            <SpecialConfig
              db={db}
              key={db.id.toString()}
              dbConfigs={dbConfigs}
              setDBConfig={setDBConfig}
              targetId={targetId}
              setTargetId={setTargetId}
              generalStrategy={generalStrategy}
            />
          ))}
          <ClearOverridesButton
            onClick={() => {
              clearDBOverrides();
            }}
          >{t`Clear all overrides`}</ClearOverridesButton>
        </EditorPanel>
        <ConfigPanel role="group">
          {targetId !== null && (
            <ConfigPanelSection>
              <Radio.Group
                value={currentConfig?.strategy ?? generalStrategy}
                name={`caching-strategy-for-database-${targetId}`}
                onChange={strategyType => {
                  if (!isValidCacheStrategyType(strategyType)) {
                    console.error("invalid strategy type", strategyType);
                    return;
                  }
                  setDBConfig(targetId, {
                    model: "database",
                    model_id: targetId,
                    strategy: { type: strategyType },
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
  db,
  key,
  dbConfigs,
  setDBConfig: setDBConfig,
  targetId: targetId,
  setTargetId: setTargetId,
  generalStrategy,
}: {
  db: Database;
  key: string;
  targetId: number | null;
  setTargetId: Dispatch<SetStateAction<number | null>>;
  dbConfigs: Map<number, CacheConfig>;
  setDBConfig: DBConfigSetter;
  generalStrategy: CacheStrategy | undefined;
}) => {
  const specificConfigForDB = dbConfigs.get(db.id);
  const specificStrategyForDB = specificConfigForDB?.strategy;
  const doesOverrideGeneralConfig =
    specificStrategyForDB !== undefined &&
    specificStrategyForDB.type !== generalStrategy?.type;
  // TODO: When other kinds of strategies are added we will need a deeper check.
  const strategyForDB = specificStrategyForDB ?? generalStrategy;
  if (!strategyForDB) {
    throw new Error(t`Invalid strategy "${strategyForDB}"`);
  }
  const strategyLabel = CacheStrategyTypes[strategyForDB.type];
  const isConfigBeingEdited = targetId === db.id;
  const clearOverride = () => {
    setDBConfig(db.id, null);
  };
  const shouldHighlightButton =
    doesOverrideGeneralConfig && !isConfigBeingEdited;
  return (
    <SpecialConfigStyled
      {...getButtonProps({ shouldHighlightButton: isConfigBeingEdited })}
      key={key}
      onClick={() => {
        setTargetId(db.id);
      }}
    >
      <DatabasesConfigIcon name="database" />
      {db.name}
      <SpecialStrategy
        {...getButtonProps({ shouldHighlightButton })}
        onClick={(e: MouseEvent<HTMLButtonElement>) => {
          if (doesOverrideGeneralConfig) {
            clearOverride();
            e.stopPropagation();
          }
        }}
      >
        {strategyLabel}
        {doesOverrideGeneralConfig && (
          <Icon style={{ marginLeft: ".5rem" }} name="close" />
        )}
      </SpecialStrategy>
    </SpecialConfigStyled>
  );
};

export const getButtonProps = ({
  shouldHighlightButton,
}: {
  shouldHighlightButton: boolean;
}): ButtonProps => {
  return {
    radius: "sm",
    style: {
      border: shouldHighlightButton
        ? `1px solid ${color("brand")}`
        : `1px solid ${color("border")}`,
    },
    variant: shouldHighlightButton ? "filled" : "white",
    animate: false,
  };
};
