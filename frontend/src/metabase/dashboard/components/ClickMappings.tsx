import cx from "classnames";
import { assocIn, dissocIn, getIn } from "icepick";
import type { ComponentType } from "react";
import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import { Select } from "metabase/common/components/Select";
import CS from "metabase/css/core/index.css";
import { getDashcardData, getParameters } from "metabase/dashboard/selectors";
import { isQuestionDashCard } from "metabase/dashboard/utils";
import { isPivotGroupColumn } from "metabase/lib/data_grid";
import { connect } from "metabase/lib/redux";
import MetabaseSettings from "metabase/lib/settings";
import { loadMetadataForCard } from "metabase/questions/actions";
import { getMetadata } from "metabase/selectors/metadata";
import { GTAPApi } from "metabase/services";
import { Flex, Icon } from "metabase/ui";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import {
  getTargetsForDashboard,
  getTargetsForQuestion,
} from "metabase-lib/v1/parameters/utils/click-behavior";
import type {
  ClickBehavior,
  ClickBehaviorParameterMapping,
  ClickBehaviorTarget,
  Dashboard,
  DashboardCard,
  DatasetColumn,
  Parameter,
} from "metabase-types/api";
import type { State } from "metabase-types/store";

import S from "./ClickMappings.module.css";

type SourceType = "column" | "parameter" | "userAttribute";

type SourceOption = {
  type?: SourceType;
  id?: string;
  name?: string;
};

type SourceOptionsByType = Partial<Record<SourceType, SourceOption[]>>;

type TargetItem = {
  id: string;
  name: string | null | undefined;
  target: ClickBehaviorTarget;
  sourceFilters: {
    column: (source: DatasetColumn, question: Question) => boolean;
    parameter: (source: Parameter, question: Question) => boolean;
    userAttribute: (source: string, question: Question) => boolean;
  };
  type?: ClickBehaviorTarget["type"];
};

type ClickMappingsOwnProps = {
  object: Dashboard | Question | undefined;
  dashcard: DashboardCard;
  isDashboard?: boolean;
  clickBehavior: ClickBehavior;
  updateSettings: (settings: Partial<ClickBehavior>) => void;
  excludeParametersSources?: boolean;
};

type ClickMappingsStateProps = {
  setTargets: TargetItem[];
  unsetTargets: TargetItem[];
  sourceOptions: {
    column: DatasetColumn[];
    parameter: Parameter[];
  };
  question: Question;
};

type ClickMappingsHocProps = {
  userAttributes: string[];
};

type ClickMappingsProps = ClickMappingsOwnProps &
  ClickMappingsStateProps &
  ClickMappingsHocProps;

function getTargetName(object: Dashboard | Question | undefined) {
  const objectType = clickTargetObjectType(object);
  return { dashboard: t`filter`, native: t`variable`, gui: t`column` }[
    objectType
  ];
}

function getTargetsHeading(
  object: Dashboard | Question | undefined,
  setTargets: TargetItem[],
) {
  const objectType = clickTargetObjectType(object);
  if (objectType === "dashboard") {
    return setTargets.length > 0
      ? t`Other available filters`
      : t`Available filters`;
  }
  if (objectType === "native") {
    return setTargets.length > 0
      ? t`Other available variables`
      : t`Available variables`;
  }
  if (objectType === "gui") {
    return setTargets.length > 0
      ? t`Other available columns`
      : t`Available columns`;
  }
  return "Unknown";
}

function ClickMappings(props: ClickMappingsProps) {
  const { setTargets, unsetTargets, question } = props;

  const sourceOptions: {
    column: DatasetColumn[];
    parameter: Parameter[];
    userAttribute: string[];
  } = useMemo(
    () => ({
      ...props.sourceOptions,
      userAttribute: props.userAttributes,
    }),
    [props.sourceOptions, props.userAttributes],
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
          <TargetWithSource
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
                <TargetWithoutSource
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

export const ClickMappingsConnected = _.compose(
  loadQuestionMetadata((_state: State, props: ClickMappingsOwnProps) =>
    props.object instanceof Question && !props.isDashboard
      ? props.object
      : null,
  ),
  withUserAttributes,
  connect(
    (state: State, props: ClickMappingsOwnProps & ClickMappingsHocProps) => {
      const { object, isDashboard, dashcard, clickBehavior } = props;
      let parameters = getParameters(state);
      const metadata = getMetadata(state);
      const dashcardData = getDashcardData(state, dashcard.id);
      const question = new Question(dashcard.card, metadata);

      if (props.excludeParametersSources) {
        const parameterMapping: ClickBehaviorParameterMapping =
          clickBehavior.type === "crossfilter" ||
          (clickBehavior.type === "link" &&
            (clickBehavior.linkType === "dashboard" ||
              clickBehavior.linkType === "question"))
            ? (clickBehavior.parameterMapping ?? {})
            : {};

        const parametersUsedAsSources = Object.values(parameterMapping)
          .filter(
            (mapping) => getIn(mapping, ["source", "type"]) === "parameter",
          )
          .map((mapping) => mapping.source.id);

        parameters = parameters.filter((parameter) => {
          return parametersUsedAsSources.includes(parameter.id);
        });
      }

      const [setTargets, unsetTargets] = _.partition(
        isDashboard &&
          object &&
          !(object instanceof Question) &&
          isQuestionDashCard(dashcard)
          ? getTargetsForDashboard(object, dashcard)
          : object instanceof Question
            ? getTargetsForQuestion(object)
            : [],
        ({ id }: { id: string }) =>
          getIn(clickBehavior, ["parameterMapping", id, "source"]) != null,
      );

      const availableColumns: DatasetColumn[] = Object.values(
        dashcardData ?? {},
      ).flatMap((dataset) => {
        if (!dataset || typeof dataset !== "object") {
          return [];
        }
        const cols = getIn(dataset, ["data", "cols"]);
        return Array.isArray(cols) ? cols : [];
      });

      const sourceOptions = {
        column: availableColumns.filter(isMappableColumn),
        parameter: parameters,
      };

      return { setTargets, unsetTargets, sourceOptions, question };
    },
  ),
)(ClickMappings);

const getKeyForSource = (option: SourceOption) =>
  option.type == null ? null : `${option.type}-${option.id}`;

const getSourceOption = {
  column: (column: DatasetColumn): SourceOption => ({
    type: "column",
    id: column.name,
    name: column.display_name,
  }),
  parameter: (parameter: Parameter): SourceOption => ({
    type: "parameter",
    id: parameter.id,
    name: parameter.name,
  }),
  userAttribute: (name: string): SourceOption => ({
    type: "userAttribute",
    name: name,
    id: name,
  }),
};

function TargetWithoutSource({
  target,
  sourceOptions,
  clickBehavior,
  updateSettings,
}: {
  target: TargetItem;
  sourceOptions: SourceOptionsByType;
  clickBehavior: ClickBehavior;
  updateSettings: (settings: Partial<ClickBehavior>) => void;
}) {
  const { id, name, type } = target;

  return (
    <Select
      key={id}
      triggerElement={
        <Flex
          className={S.TargetTrigger}
          p="sm"
          mb="sm"
          fw="bold"
          w="100%"
          data-testid="click-target-column"
        >
          {name}
        </Flex>
      }
      value={null}
      sections={Object.entries(sourceOptions).map(([sourceType, items]) => ({
        name: {
          parameter: t`Dashboard filters`,
          column: t`Columns`,
          userAttribute: t`User attributes`,
        }[sourceType],
        items,
      }))}
      optionValueFn={getKeyForSource}
      optionNameFn={(option: SourceOption) =>
        option.type == null ? t`None` : option.name
      }
      onChange={({ target: { value } }: { target: { value: string } }) => {
        updateSettings(
          assocIn(clickBehavior, ["parameterMapping", id], {
            source: Object.values(sourceOptions)
              .flat()
              .find((option) => getKeyForSource(option) === value),
            target: target.target,
            id,
            type,
          }),
        );
      }}
    />
  );
}

function TargetWithSource({
  target,
  targetName,
  clickBehavior,
  updateSettings,
}: {
  target: TargetItem;
  targetName: string | undefined;
  clickBehavior: ClickBehavior;
  updateSettings: (settings: Partial<ClickBehavior>) => void;
}) {
  const { name, id } = target;
  const source: { name?: string; type?: SourceType } =
    getIn(clickBehavior, ["parameterMapping", id, "source"]) ?? {};

  return (
    <div className={CS.mb2}>
      <div
        className={cx(
          CS.bordered,
          CS.rounded,
          CS.p2,
          CS.textMedium,
          CS.flex,
          CS.alignCenter,
        )}
        // eslint-disable-next-line metabase/no-color-literals
        style={{ borderColor: "#E2E4E8" }}
      >
        <svg
          width="12"
          height="38"
          viewBox="0 0 12 38"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ marginLeft: 8, marginRight: 8 }}
        >
          <g opacity="0.6">
            <path
              d="M9 32C9 33.6569 7.65685 35 6 35C4.34315 35 3 33.6569 3 32C3 30.3431 4.34315 29 6 29C7.65685 29 9 30.3431 9 32Z"
              // eslint-disable-next-line metabase/no-color-literals
              fill="#509EE3"
            />
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M12 6C12 8.973 9.83771 11.441 7 11.917V26.083C9.83771 26.559 12 29.027 12 32C12 35.3137 9.31371 38 6 38C2.68629 38 0 35.3137 0 32C0 29.027 2.16229 26.559 5 26.083V11.917C2.16229 11.441 0 8.973 0 6C0 2.68629 2.68629 0 6 0C9.31371 0 12 2.68629 12 6ZM6 10C8.20914 10 10 8.20914 10 6C10 3.79086 8.20914 2 6 2C3.79086 2 2 3.79086 2 6C2 8.20914 3.79086 10 6 10ZM6 36C8.20914 36 10 34.2091 10 32C10 29.7909 8.20914 28 6 28C3.79086 28 2 29.7909 2 32C2 34.2091 3.79086 36 6 36Z"
              // eslint-disable-next-line metabase/no-color-literals
              fill="#509EE3"
            />
          </g>
        </svg>
        <div>
          <div>
            <span className={cx(CS.textBold, CS.textDark)}>{source.name}</span>{" "}
            {source.type != null &&
              {
                column: t`column`,
                parameter: t`filter`,
                userAttribute: t`user attribute`,
              }[source.type]}
          </div>
          <div style={{ marginTop: 9 }}>
            <span className={cx(CS.textBrand, CS.textBold)}>{name}</span>{" "}
            {targetName}
          </div>
        </div>
        <div
          className={cx(CS.cursorPointer, CS.mlAuto)}
          onClick={() =>
            updateSettings(dissocIn(clickBehavior, ["parameterMapping", id]))
          }
        >
          <Icon name="close" size={12} />
        </div>
      </div>
    </div>
  );
}

/**
 * TODO: Extract this to a more general HOC. It can probably also take care of withTableMetadataLoaded.
 *
 * @deprecated HOCs are deprecated
 */
function loadQuestionMetadata(
  getQuestion: (
    state: State,
    props: ClickMappingsOwnProps,
  ) => Question | null | undefined,
) {
  type ComposedProps = Record<string, unknown>;

  return (ComposedComponent: ComponentType<ComposedProps>) => {
    interface MetadataLoaderProps {
      question?: Question | null;
      metadata?: Metadata;
      loadMetadataForCard: (
        ...args: Parameters<typeof loadMetadataForCard>
      ) => Promise<unknown>;
    }

    function MetadataLoader(props: MetadataLoaderProps) {
      const { question, loadMetadataForCard, ...rest } = props;

      useEffect(() => {
        if (question instanceof Question) {
          loadMetadataForCard(question.card());
        }
      }, [question, loadMetadataForCard]);

      return <ComposedComponent {...rest} />;
    }

    return connect(
      (state: State, props: ClickMappingsOwnProps) => ({
        question: getQuestion && getQuestion(state, props),
      }),
      { loadMetadataForCard },
    )(MetadataLoader);
  };
}

export function withUserAttributes<TProps extends ClickMappingsHocProps>(
  ComposedComponent: ComponentType<TProps>,
) {
  return function WithUserAttributes(
    props: Omit<TProps, keyof ClickMappingsHocProps>,
  ) {
    const [userAttributes, setUserAttributes] = useState<string[]>([]);

    useEffect(() => {
      let isMounted = true;

      const loadUserAttributes = async () => {
        if (MetabaseSettings.sandboxingEnabled()) {
          const attributes = await GTAPApi.attributes();
          if (isMounted) {
            setUserAttributes(attributes);
          }
        }
      };

      loadUserAttributes();

      return () => {
        isMounted = false;
      };
    }, []);

    return (
      <ComposedComponent
        {...(props as TProps)}
        userAttributes={userAttributes}
      />
    );
  };
}

export function isMappableColumn(column: { name: string }) {
  // Pivot tables have a column in the result set that shouldn't be displayed.
  return !isPivotGroupColumn(column);
}

export function clickTargetObjectType(
  object: Dashboard | Question | undefined,
): "dashboard" | "native" | "gui" {
  if (!(object instanceof Question)) {
    return "dashboard";
  }

  const query = object.query();
  const { isNative } = Lib.queryDisplayInfo(query);

  return isNative ? "native" : "gui";
}
