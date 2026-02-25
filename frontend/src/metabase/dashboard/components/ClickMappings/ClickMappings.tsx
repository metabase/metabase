import cx from "classnames";
import { useMemo } from "react";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import Question from "metabase-lib/v1/Question";
import type { DatasetColumn, Parameter } from "metabase-types/api";

import { ClickMappingsTargetWithSource } from "./ClickMappingsTargetWithSource";
import { ClickMappingsTargetWithoutSource } from "./ClickMappingsTargetWithoutSource";
import { useLoadQuestionMetadata, useUserAttributes } from "./hooks";
import type {
  ClickMappingsOwnProps,
  SourceOptionsByType,
  TargetItem,
} from "./types";
import { useClickMappingsData } from "./useClickMappingsData";
import { getSourceOption, getTargetName, getTargetsHeading } from "./utils";

export function ClickMappings(props: ClickMappingsOwnProps) {
  const {
    setTargets,
    unsetTargets,
    question,
    sourceOptions: baseSourceOptions,
  } = useClickMappingsData(props);
  const userAttributes = useUserAttributes();

  const questionForMetadata =
    props.object instanceof Question && !props.isDashboard
      ? props.object
      : null;
  useLoadQuestionMetadata(questionForMetadata);

  const sourceOptions: {
    column: DatasetColumn[];
    parameter: Parameter[];
    userAttribute: string[];
  } = useMemo(
    () => ({
      ...baseSourceOptions,
      userAttribute: userAttributes,
    }),
    [baseSourceOptions, userAttributes],
  );

  const unsetTargetsWithSourceOptions = useMemo(
    () =>
      unsetTargets
        .map((target: TargetItem) => {
          const targetSourceOptions: SourceOptionsByType = {};

          const columnOptions = sourceOptions.column
            .filter((column) => target.sourceFilters.column(column, question))
            .map(getSourceOption.column);
          if (columnOptions.length > 0) {
            targetSourceOptions.column = columnOptions;
          }

          const parameterOptions = sourceOptions.parameter
            .filter((parameter) =>
              target.sourceFilters.parameter(parameter, question),
            )
            .map(getSourceOption.parameter);
          if (parameterOptions.length > 0) {
            targetSourceOptions.parameter = parameterOptions;
          }

          const userAttributeOptions = sourceOptions.userAttribute
            .filter((name) =>
              target.sourceFilters.userAttribute(name, question),
            )
            .map(getSourceOption.userAttribute);
          if (userAttributeOptions.length > 0) {
            targetSourceOptions.userAttribute = userAttributeOptions;
          }

          return {
            target,
            sourceOptions: targetSourceOptions,
          };
        })
        .filter(
          ({ sourceOptions }: { sourceOptions: SourceOptionsByType }) =>
            Object.keys(sourceOptions).length > 0,
        ),
    [question, sourceOptions, unsetTargets],
  );

  if (unsetTargetsWithSourceOptions.length === 0 && setTargets.length === 0) {
    return (
      <p
        className={cx(CS.textCentered, CS.textMedium)}
      >{t`No available targets`}</p>
    );
  }

  return (
    <div data-testid="click-mappings">
      <div>
        {setTargets.map((target) => (
          <ClickMappingsTargetWithSource
            key={target.id}
            targetName={getTargetName(props.object)}
            target={target}
            clickBehavior={props.clickBehavior}
            updateSettings={props.updateSettings}
          />
        ))}
      </div>
      {unsetTargetsWithSourceOptions.length > 0 && (
        <div>
          <p className={cx(CS.mb2, CS.textMedium)}>
            {getTargetsHeading(props.object, setTargets)}
          </p>
          <div data-testid="unset-click-mappings">
            {unsetTargetsWithSourceOptions.map(
              ({
                target,
                sourceOptions,
              }: {
                target: TargetItem;
                sourceOptions: SourceOptionsByType;
              }) => (
                <ClickMappingsTargetWithoutSource
                  key={target.id}
                  target={target}
                  clickBehavior={props.clickBehavior}
                  updateSettings={props.updateSettings}
                  sourceOptions={sourceOptions}
                />
              ),
            )}
          </div>
        </div>
      )}
    </div>
  );
}
