import type { Dispatch, MouseEvent, SetStateAction } from "react";
import { useState } from "react";
import { t } from "ttag";

import { color } from "metabase/lib/colors";
import type { ButtonProps } from "metabase/ui";
import { Icon, Radio, Text } from "metabase/ui";
import type Database from "metabase-lib/metadata/Database";

import type {
  Config,
  DBStrategySetter,
  GetConfigByModelId,
  RootStrategySetter,
  Strategy,
} from "../types";
import { isValidStrategy, isValidStrategyName, Strategies } from "../types";

import {
  ClearOverridesButton,
  ConfigPanel,
  ConfigPanelSection,
  DatabaseConfigDisplayStyled,
  DatabasesConfigIcon,
  Editor,
  EditorPanel,
  Explanation,
  RootConfigDisplay,
  StrategyDisplay,
  TabWrapper,
} from "./DatabaseStrategyEditor.styled";

export const DatabaseStrategyEditor = ({
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
  const [editingWhichDatabaseId, setEditingWhichDatabaseId] = useState<
    number | null
  >(null);
  const [editingRootConfig, setEditingRootConfig] = useState<boolean>(false);
  const currentStrategy = editingRootConfig
    ? rootStrategy
    : editingWhichDatabaseId === null
    ? null
    : dbConfigs.get(editingWhichDatabaseId)?.strategy;

  const setDatabaseStrategyType = (strategyType: string) => {
    if (!isValidStrategyName(strategyType)) {
      console.error("Invalid strategy type", strategyType);
      return;
    }
    const newStrategy = {
      type: strategyType,
      ...Strategies[strategyType].defaults,
    };
    if (!isValidStrategy(newStrategy)) {
      console.error("Invalid strategy");
      return;
    }
    if (editingRootConfig) {
      setRootStrategy(newStrategy);
    } else if (editingWhichDatabaseId !== null) {
      setDBStrategy(editingWhichDatabaseId, newStrategy);
    } else {
      console.error("No target specified");
    }
  };

  const showEditor = editingRootConfig || editingWhichDatabaseId !== null;

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
          <RootConfigDisplay
            {...getButtonProps({
              shouldHighlightButton: editingRootConfig,
            })}
            onClick={() => {
              setEditingRootConfig(true);
              setEditingWhichDatabaseId(null);
            }}
          >
            <DatabasesConfigIcon name="database" />
            {t`Databases`}
            <StrategyDisplay
              {...getButtonProps({
                shouldHighlightButton: !editingRootConfig,
              })}
            >
              {rootStrategyLabel}
            </StrategyDisplay>
          </RootConfigDisplay>
        </EditorPanel>
        <EditorPanel role="group">
          {databases.map(db => (
            <DatabaseConfigDisplay
              db={db}
              key={db.id.toString()}
              dbConfigs={dbConfigs}
              setDBStrategy={setDBStrategy}
              targetDatabaseId={editingWhichDatabaseId}
              setEditingWhichDatabaseId={databaseId => {
                setEditingRootConfig(false);
                setEditingWhichDatabaseId(databaseId);
              }}
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
          {showEditor && (
            <ConfigPanelSection>
              <Radio.Group
                value={currentStrategy?.type ?? rootStrategy?.type}
                name={`caching-strategy-for-database-${editingWhichDatabaseId}`}
                onChange={strategyType => {
                  setDatabaseStrategyType(strategyType);
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

export const DatabaseConfigDisplay = ({
  db,
  key,
  dbConfigs,
  setDBStrategy,
  targetDatabaseId,
  setEditingWhichDatabaseId,
  rootStrategy,
}: {
  db: Database;
  key: string;
  targetDatabaseId: number | null;
  setEditingWhichDatabaseId: Dispatch<SetStateAction<number | null>>;
  dbConfigs: Map<number, Config>;
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
  const isBeingEdited = targetDatabaseId === db.id;
  const clearOverride = () => {
    setDBStrategy(db.id, null);
  };
  const shouldHighlightButton = overridesRoot && !isBeingEdited;
  return (
    <DatabaseConfigDisplayStyled
      {...getButtonProps({ shouldHighlightButton: isBeingEdited })}
      key={key}
      onClick={() => {
        setEditingWhichDatabaseId(db.id);
      }}
    >
      <DatabasesConfigIcon name="database" />
      {db.name}
      <StrategyDisplay
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
      </StrategyDisplay>
    </DatabaseConfigDisplayStyled>
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
