/* @flow */

import React, { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { t } from "ttag";
import S from "./DashCardCardParameterMapper.css";

import Icon from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";

import ParameterTargetWidget from "metabase/parameters/components/ParameterTargetWidget";

import { fetchDatabaseMetadata } from "metabase/redux/metadata";

import {
  getEditingParameter,
  getParameterTarget,
  makeGetParameterMappingOptions,
  getMappingsByParameter,
} from "../selectors";
import { setParameterMapping } from "../dashboard";

import cx from "classnames";
import { getIn } from "icepick";

import type { Card } from "metabase-types/types/Card";
import type { DashCard } from "metabase-types/types/Dashboard";
import type {
  Parameter,
  ParameterId,
  ParameterMappingUIOption,
  ParameterTarget,
} from "metabase-types/types/Parameter";
import type { DatabaseId } from "metabase-types/types/Database";

import type { MappingsByParameter } from "../selectors";
import AtomicQuery from "metabase-lib/lib/queries/AtomicQuery";

const makeMapStateToProps = () => {
  const getParameterMappingOptions = makeGetParameterMappingOptions();
  const mapStateToProps = (state, props) => ({
    parameter: getEditingParameter(state, props),
    mappingOptions: getParameterMappingOptions(state, props),
    target: getParameterTarget(state, props),
    mappingsByParameter: getMappingsByParameter(state, props),
  });
  return mapStateToProps;
};

const mapDispatchToProps = {
  setParameterMapping,
  fetchDatabaseMetadata,
};

@connect(
  makeMapStateToProps,
  mapDispatchToProps,
)
export default class DashCardCardParameterMapper extends Component {
  props: {
    card: Card,
    dashcard: DashCard,
    parameter: Parameter,
    target: ParameterTarget,
    mappingOptions: Array<ParameterMappingUIOption>,
    mappingsByParameter: MappingsByParameter,
    fetchDatabaseMetadata: (id: ?DatabaseId) => void,
    setParameterMapping: (
      parameter_id: ParameterId,
      dashcard_id: number,
      card_id: number,
      target: ?ParameterTarget,
    ) => void,
  };

  static propTypes = {
    dashcard: PropTypes.object.isRequired,
    card: PropTypes.object.isRequired,
  };
  static defaultProps = {};

  componentDidMount() {
    const { card } = this.props;
    // Type check for Flow

    card.dataset_query instanceof AtomicQuery &&
      this.props.fetchDatabaseMetadata(card.dataset_query.database);
  }

  handleChangeTarget = (target: ?ParameterTarget) => {
    const { setParameterMapping, parameter, dashcard, card } = this.props;
    setParameterMapping(parameter.id, dashcard.id, card.id, target);
  };

  render() {
    const {
      mappingOptions,
      target,
      mappingsByParameter,
      parameter,
      dashcard,
      card,
    } = this.props;

    const mapping = getIn(mappingsByParameter, [
      parameter.id,
      dashcard.id,
      card.id,
    ]);
    const noOverlap = !!(
      mapping &&
      mapping.mappingsWithValues > 1 &&
      mapping.overlapMax === 1
    );

    let selectedFieldWarning = null;
    if (
      // variable targets can't accept an list of values like dimension targets
      target &&
      target[0] === "variable" &&
      // date parameters only accept a single value anyways, so hide the warning
      !parameter.type.startsWith("date/")
    ) {
      selectedFieldWarning = t`This field only accepts a single value because it's used in a SQL query.`;
    }

    return (
      <div className="mx1 flex flex-column align-center drag-disabled">
        {dashcard.series && dashcard.series.length > 0 && (
          <div
            className="h5 mb1 text-bold"
            style={{
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              overflowX: "hidden",
              maxWidth: 100,
            }}
          >
            {card.name}
          </div>
        )}

        <ParameterTargetWidget
          target={target}
          onChange={this.handleChangeTarget}
          mappingOptions={mappingOptions}
        >
          {({ selected, disabled }) => (
            <Tooltip
              tooltip={
                disabled
                  ? "This card doesn't have any fields or parameters that can be mapped to this parameter type."
                  : noOverlap
                  ? "The values in this field don't overlap with the values of any other fields you've chosen."
                  : null
              }
              verticalAttachments={["bottom", "top"]}
            >
              {/* using div instead of button due to
                                          https://bugzilla.mozilla.org/show_bug.cgi?id=984869
                                          and click event on close button not propagating in FF
                                      */}
              <div
                className={cx(S.button, {
                  [S.mapped]: !!selected,
                  [S.warn]: noOverlap,
                  [S.disabled]: disabled,
                })}
              >
                <span className="text-centered mr1">
                  {disabled
                    ? t`No valid fields`
                    : selected
                    ? selected.name
                    : t`Select…`}
                </span>
                {selected ? (
                  <Icon
                    className="flex-align-right"
                    name="close"
                    size={16}
                    onClick={e => {
                      this.handleChangeTarget(null);
                      e.stopPropagation();
                    }}
                  />
                ) : !disabled ? (
                  <Icon
                    className="flex-align-right"
                    name="chevrondown"
                    size={16}
                  />
                ) : null}
              </div>
            </Tooltip>
          )}
        </ParameterTargetWidget>
        {selectedFieldWarning && (
          <span style={{ height: 0 }} className="mt1 mbn1 px4 text-centered">
            {selectedFieldWarning}
          </span>
        )}
      </div>
    );
  }
}
