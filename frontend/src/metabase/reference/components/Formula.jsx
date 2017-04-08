import React from "react";
import PropTypes from "prop-types";
import pure from "recompose/pure";
import cx from "classnames";

import ReactCSSTransitionGroup from "react-addons-css-transition-group";

import S from "./Formula.css";

import Icon from "metabase/components/Icon.jsx";

import QueryDefinition from "metabase/query_builder/components/dataref/QueryDefinition.jsx";

const Formula = ({
    type,
    entity,
    table,
    isExpanded,
    expandFormula,
    collapseFormula
}) =>
    <div
        className={cx(S.formula)}
        onClick={isExpanded ? collapseFormula : expandFormula}
    >
        <div className={S.formulaHeader}>
            <Icon name="beaker" size={24} />
            <span className={S.formulaTitle}>View the {type} formula</span>
        </div>
        <ReactCSSTransitionGroup
            transitionName="formulaDefinition"
            transitionEnterTimeout={300}
            transitionLeaveTimeout={300}
        >
            { isExpanded &&
                <div key="formulaDefinition" className="formulaDefinition">
                    <QueryDefinition
                        className={S.formulaDefinitionInner}
                        object={entity}
                        tableMetadata={table}
                    />
                </div>
            }
        </ReactCSSTransitionGroup>
    </div>

Formula.propTypes = {
    type: PropTypes.string.isRequired,
    entity: PropTypes.object.isRequired,
    table: PropTypes.object.isRequired,
    isExpanded: PropTypes.bool.isRequired,
    expandFormula: PropTypes.func.isRequired
};

export default pure(Formula);
