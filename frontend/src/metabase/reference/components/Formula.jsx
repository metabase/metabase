/* eslint-disable react/prop-types */
import { Component } from "react";
import cx from "classnames";
import { connect } from "react-redux";
import { t } from "ttag";
import { TransitionGroup, CSSTransition } from "react-transition-group";

import { Icon } from "metabase/core/components/Icon";

import QueryDefinition from "metabase/query_builder/components/QueryDefinition";
import { fetchTableMetadata } from "metabase/redux/metadata";
import S from "./Formula.css";

const mapDispatchToProps = {
  fetchTableMetadata,
};

class Formula extends Component {
  render() {
    const { type, entity, isExpanded, expandFormula, collapseFormula } =
      this.props;

    return (
      <div
        className={cx(S.formula)}
        onClick={isExpanded ? collapseFormula : expandFormula}
      >
        <div className={S.formulaHeader}>
          <Icon name="beaker" size={24} />
          <span className={S.formulaTitle}>{t`View the ${type} formula`}</span>
        </div>
        <TransitionGroup>
          {isExpanded && (
            <CSSTransition
              key="formulaDefinition"
              classNames="formulaDefinition"
              timeout={{
                enter: 300,
                exit: 300,
              }}
            >
              <div className="formulaDefinition">
                <QueryDefinition
                  className={S.formulaDefinitionInner}
                  object={entity}
                />
              </div>
            </CSSTransition>
          )}
        </TransitionGroup>
      </div>
    );
  }
}

export default connect(null, mapDispatchToProps)(Formula);
