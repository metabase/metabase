/* eslint-disable react/prop-types */
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

class Formula extends Component {
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
          component="div"
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

export default connect(null, mapDispatchToProps)(Formula);
