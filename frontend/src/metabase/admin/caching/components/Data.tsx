import type { Dispatch, MouseEvent, SetStateAction } from "react";
import { useState } from "react";
import { t } from "ttag";

import { color } from "metabase/lib/colors";
import type { ButtonProps } from "metabase/ui";
import { Icon, Radio, Text } from "metabase/ui";
import type Database from "metabase-lib/metadata/Database";

import type {
  CacheConfig,
  DBStrategySetter,
  GetConfigByModelId,
  RootStrategySetter,
  Strategy,
} from "../types";
import { isValidStrategyName, Strategies } from "../types";

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
  rootStrategy,
  dbConfigs,
  setRootStrategy,
  setDBStrategy,
  clearDBOverrides,
}: {
  rootStrategy: Strategy;
  databases: Database[];
  dbConfigs: GetConfigByModelId;
  setDBStrategy: DBStrategySetter;
  setRootStrategy: RootStrategySetter;
  clearDBOverrides: () => void;
}) => {
  const rootStrategyLabel = rootStrategy
    ? Strategies[rootStrategy?.type]?.label
    : null;

  // if targetId is 0, the general strategy is being configured
  const [targetId, setTargetId] = useState<number | null>(null);
  const currentConfig = targetId !== null ? dbConfigs.get(targetId) : null;
  // TODO: See if I can keep all zero-related logic in CacheApp
  const editingRootConfig = targetId === 0;

  // TODO: Extract a single component for both GeneralConfig and SpecialConfig

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
              shouldHighlightButton: editingRootConfig,
            })}
            onClick={() => setTargetId(0)}
          >
            <DatabasesConfigIcon name="database" />
            {t`Databases`}
            <GeneralStrategy
              {...getButtonProps({
                shouldHighlightButton: !editingRootConfig,
              })}
            >
              {rootStrategyLabel}
            </GeneralStrategy>
          </GeneralConfig>
        </EditorPanel>
        <EditorPanel role="group">
          {databases.map(db => (
            <SpecialConfig
              db={db}
              key={db.id.toString()}
              dbConfigs={dbConfigs}
              setDBStrategy={setDBStrategy}
              targetId={targetId}
              setTargetId={setTargetId}
              rootStrategy={rootStrategy}
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
                value={currentConfig?.strategy.type ?? rootStrategy?.type}
                name={`caching-strategy-for-database-${targetId}`}
                onChange={strategyType => {
                  if (!isValidStrategyName(strategyType)) {
                    console.error("invalid strategy type", strategyType);
                    return;
                  }
                  const newStrategy = {
                    type: strategyType,
                    ...Strategies[strategyType].defaults,
                  } as Strategy; // TODO See if this 'as' can be avoided
                  if (editingRootConfig) {
                    setRootStrategy(newStrategy);
                  } else {
                    setDBStrategy(targetId, newStrategy);
                  }
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

// TODO: Rename to DatabaseConfig or something like that
export const SpecialConfig = ({
  db,
  key,
  dbConfigs,
  setDBStrategy,
  targetId,
  setTargetId,
  rootStrategy,
}: {
  db: Database;
  key: string;
  targetId: number | null;
  setTargetId: Dispatch<SetStateAction<number | null>>;
  dbConfigs: Map<number, CacheConfig>;
  setDBStrategy: DBStrategySetter;
  rootStrategy: Strategy | undefined;
}) => {
  const dbConfig = dbConfigs.get(db.id);
  const savedDBStrategy = dbConfig?.strategy;
  const overridesRoot =
    savedDBStrategy !== undefined &&
    savedDBStrategy.type !== rootStrategy?.type;
  // TODO: When other kinds of strategies are added we will need a deeper check.
  const strategyForDB = savedDBStrategy ?? rootStrategy;
  if (!strategyForDB) {
    throw new Error(t`Invalid strategy "${strategyForDB}"`);
  }
  const strategyLabel = Strategies[strategyForDB.type]?.label;
  const isBeingEdited = targetId === db.id;
  const clearOverride = () => {
    setDBStrategy(db.id, null);
  };
  const shouldHighlightButton = overridesRoot && !isBeingEdited;
  return (
    <SpecialConfigStyled
      {...getButtonProps({ shouldHighlightButton: isBeingEdited })}
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
          if (overridesRoot) {
            clearOverride();
            e.stopPropagation();
          }
        }}
      >
        {strategyLabel}
        {overridesRoot && <Icon style={{ marginLeft: ".5rem" }} name="close" />}
      </SpecialStrategy>
    </SpecialConfigStyled>
  );
};

// TODO: No bueno, get rid of this
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
