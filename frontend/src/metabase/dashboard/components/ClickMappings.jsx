/* eslint-disable react/prop-types */
import { Component } from "react";
import { connect } from "react-redux";
import _ from "underscore";
import { t } from "ttag";
import { getIn, assocIn, dissocIn } from "icepick";

import { Icon } from "metabase/core/components/Icon";
import Select from "metabase/core/components/Select";

import MetabaseSettings from "metabase/lib/settings";
import { isPivotGroupColumn } from "metabase/lib/data_grid";
import { GTAPApi } from "metabase/services";

import { loadMetadataForQuery } from "metabase/redux/metadata";
import { getParameters } from "metabase/dashboard/selectors";
import {
  getTargetsForDashboard,
  getTargetsForQuestion,
} from "metabase-lib/parameters/utils/click-behavior";
import Question from "metabase-lib/Question";
import { TargetTrigger } from "./ClickMappings.styled";

class ClickMappings extends Component {
  render() {
    const { setTargets, unsetTargets } = this.props;
    const sourceOptions = {
      ...this.props.sourceOptions,
      userAttribute: this.props.userAttributes,
    };

    const unsetTargetsWithSourceOptions = _.chain(unsetTargets)
      .map(target => ({
        target,
        sourceOptions: _.chain(sourceOptions)
          .mapObject((sources, sourceType) =>
            sources
              .filter(target.sourceFilters[sourceType])
              .map(getSourceOption[sourceType]),
          )
          .pairs()
          .filter(([, sources]) => sources.length > 0)
          .object()
          .value(),
      }))
      .filter(({ sourceOptions }) => Object.keys(sourceOptions).length > 0)
      .value();

    if (unsetTargetsWithSourceOptions.length === 0 && setTargets.length === 0) {
      return (
        <p className="text-centered text-medium">{t`No available targets`}</p>
      );
    }
    return (
      <div>
        <div>
          {setTargets.map(target => {
            return (
              <TargetWithSource
                key={target.id}
                targetName={this.getTargetName()}
                target={target}
                {...this.props}
              />
            );
          })}
        </div>
        {unsetTargetsWithSourceOptions.length > 0 && (
          <div>
            <p className="mb2 text-medium">
              {this.getTargetsHeading(setTargets)}
            </p>
            <div>
              {unsetTargetsWithSourceOptions.map(
                ({ target, sourceOptions }) => (
                  <TargetWithoutSource
                    key={target.id}
                    target={target}
                    {...this.props}
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

  getTargetName() {
    const objectType = clickTargetObjectType(this.props.object);
    return { dashboard: t`filter`, native: t`variable`, gui: t`column` }[
      objectType
    ];
  }

  getTargetsHeading(setTargets) {
    const objectType = clickTargetObjectType(this.props.object);
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
}

export const ClickMappingsConnected = _.compose(
  loadQuestionMetadata((state, props) =>
    props.isDashboard ? null : props.object,
  ),
  withUserAttributes,
  connect((state, props) => {
    const { object, isDashboard, dashcard, clickBehavior } = props;
    let parameters = getParameters(state, props);

    if (props.excludeParametersSources) {
      // Remove parameters as possible sources.
      // We still include any that were already in use prior to this code change.
      const parametersUsedAsSources = Object.values(
        clickBehavior.parameterMapping || {},
      )
        .filter(mapping => getIn(mapping, ["source", "type"]) === "parameter")
        .map(mapping => mapping.source.id);
      parameters = parameters.filter(p => {
        return parametersUsedAsSources.includes(p.id);
      });
    }

    const [setTargets, unsetTargets] = _.partition(
      isDashboard
        ? getTargetsForDashboard(object, dashcard)
        : getTargetsForQuestion(object),
      ({ id }) =>
        getIn(clickBehavior, ["parameterMapping", id, "source"]) != null,
    );
    const sourceOptions = {
      column: dashcard.card.result_metadata?.filter(isMappableColumn) || [],
      parameter: parameters,
    };
    return { setTargets, unsetTargets, sourceOptions };
  }),
)(ClickMappings);

const getKeyForSource = o => (o.type == null ? null : `${o.type}-${o.id}`);
const getSourceOption = {
  column: c => ({ type: "column", id: c.name, name: c.display_name }),
  parameter: p => ({ type: "parameter", id: p.id, name: p.name }),
  userAttribute: name => ({ type: "userAttribute", name, id: name }),
};
function TargetWithoutSource({
  target,
  sourceOptions,
  clickBehavior,
  updateSettings,
}) {
  const { id, name, type } = target;

  return (
    <Select
      key={id}
      triggerElement={<TargetTrigger>{name}</TargetTrigger>}
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
      optionNameFn={o => (o.type == null ? t`None` : o.name)}
      onChange={({ target: { value } }) => {
        updateSettings(
          assocIn(clickBehavior, ["parameterMapping", id], {
            source: Object.values(sourceOptions)
              .flat()
              .find(o => getKeyForSource(o) === value),
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
}) {
  const { name, id } = target;
  const source =
    getIn(clickBehavior, ["parameterMapping", id, "source"]) || null;
  return (
    <div className="mb2">
      <div
        className="bordered rounded p2 text-medium flex align-center"
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
              fill="#509EE3"
            />
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M12 6C12 8.973 9.83771 11.441 7 11.917V26.083C9.83771 26.559 12 29.027 12 32C12 35.3137 9.31371 38 6 38C2.68629 38 0 35.3137 0 32C0 29.027 2.16229 26.559 5 26.083V11.917C2.16229 11.441 0 8.973 0 6C0 2.68629 2.68629 0 6 0C9.31371 0 12 2.68629 12 6ZM6 10C8.20914 10 10 8.20914 10 6C10 3.79086 8.20914 2 6 2C3.79086 2 2 3.79086 2 6C2 8.20914 3.79086 10 6 10ZM6 36C8.20914 36 10 34.2091 10 32C10 29.7909 8.20914 28 6 28C3.79086 28 2 29.7909 2 32C2 34.2091 3.79086 36 6 36Z"
              fill="#509EE3"
            />
          </g>
        </svg>
        <div>
          <div>
            <span className="text-bold text-dark">{source.name}</span>{" "}
            {
              {
                column: t`column`,
                parameter: t`filter`,
                userAttribute: t`user attribute`,
              }[source.type]
            }
          </div>
          <div style={{ marginTop: 9 }}>
            <span className="text-brand text-bold">{name}</span> {targetName}
          </div>
        </div>
        <div
          className="cursor-pointer ml-auto"
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
function loadQuestionMetadata(getQuestion) {
  return ComposedComponent => {
    class MetadataLoader extends Component {
      componentDidMount() {
        if (this.props.question) {
          this.fetch();
        }
      }

      componentDidUpdate({ question: prevQuestion }) {
        const { question } = this.props;
        if (question != null && question.id !== (prevQuestion || {}).id) {
          this.fetch();
        }
      }

      fetch() {
        const { question, loadMetadataForQuery } = this.props;
        if (question) {
          loadMetadataForQuery(question.query());
        }
      }

      render() {
        const { question, metadata, ...rest } = this.props;
        return <ComposedComponent {...rest} />;
      }
    }

    return connect(
      (state, props) => ({
        question: getQuestion && getQuestion(state, props),
      }),
      { loadMetadataForQuery },
    )(MetadataLoader);
  };
}

export function withUserAttributes(ComposedComponent) {
  return class WithUserAttributes extends Component {
    state = { userAttributes: [] };

    async componentDidMount() {
      if (MetabaseSettings.enhancementsEnabled()) {
        this.setState({ userAttributes: await GTAPApi.attributes() });
      }
    }
    render() {
      return (
        <ComposedComponent
          {...this.props}
          userAttributes={this.state.userAttributes}
        />
      );
    }
  };
}

export function isMappableColumn(column) {
  // Pivot tables have a column in the result set that shouldn't be displayed.
  return !isPivotGroupColumn(column);
}

export function clickTargetObjectType(object) {
  if (!(object instanceof Question)) {
    return "dashboard";
  } else if (object.isNative()) {
    return "native";
  } else {
    return "gui";
  }
}
