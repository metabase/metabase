import React, { Component } from "react";
import cx from "classnames";
import { connect } from "react-redux";
import { t } from "ttag";
import { CSSTransitionGroup } from "react-transition-group";

import S from "./Formula.css";

import Icon from "metabase/components/Icon";

import QueryDefinition from "metabase/query_builder/components/QueryDefinition";
import { fetchTableMetadata } from "metabase/redux/metadata";

const mapDispatchToProps = {
  fetchTableMetadata,
};

@connect(
  null,
  mapDispatchToProps,
)
export default class Formula extends Component {
  props: {
    type: string,
    entity: Object,
    isExpanded: boolean,
    expandFormula: any,
    collapseFormula: any,
  };

  render() {
    const {
      type,
      entity,
      isExpanded,
      expandFormula,
      collapseFormula,
    } = this.props;

    return (
      <div
        className={cx(S.formula)}
        onClick={isExpanded ? collapseFormula : expandFormula}
      >
        <div className={S.formulaHeader}>
          <Icon name="beaker" size={24} />
          <span className={S.formulaTitle}>{t`View the ${type} formula`}</span>
        </div>
        <CSSTransitionGroup
          transitionName="formulaDefinition"
          transitionEnterTimeout={300}
          transitionLeaveTimeout={300}
        >
          {isExpanded && (
            <div key="formulaDefinition" className="formulaDefinition">
              <QueryDefinition
                className={S.formulaDefinitionInner}
                object={entity}
              />
            </div>
          )}
        </CSSTransitionGroup>
      </div>
    );
  }
}
