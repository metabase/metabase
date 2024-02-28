/* eslint-disable react/prop-types */
import cx from "classnames";
import { Component } from "react";
import { connect } from "react-redux";
import { TransitionGroup, CSSTransition } from "react-transition-group";
import { t } from "ttag";

import { QueryDefinition } from "metabase/admin/datamodel/components/QueryDefinition";
import { fetchTableMetadata } from "metabase/redux/metadata";
import { Icon } from "metabase/ui";

import S from "./Formula.module.css";

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
