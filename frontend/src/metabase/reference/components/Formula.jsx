import React, { Component, PropTypes } from "react";
import pure from "recompose/pure";
import cx from "classnames";

import S from "./Formula.css";

import Icon from "metabase/components/Icon.jsx";

import QueryDefinition from "metabase/query_builder/dataref/QueryDefinition.jsx";

const Formula = ({
    type,
    entity,
    table,
    isExpanded,
    expandFormula,
    collapseFormula
}) =>
    <div
        className={cx(S.formula, isExpanded && S.expanded)}
        onClick={isExpanded ? collapseFormula : expandFormula}
    >
        <div className={S.formulaHeader}>
            <Icon name="beaker" size={24} />
            <span className={S.formulaTitle}>View the {type} formula</span>
        </div>
        <div className={S.formulaDefinition}>
            <QueryDefinition
                object={entity}
                tableMetadata={table}
            />
        </div>
    </div>

Formula.propTypes = {
    type: PropTypes.string.isRequired,
    entity: PropTypes.object.isRequired,
    table: PropTypes.object.isRequired,
    isExpanded: PropTypes.bool.isRequired,
    expandFormula: PropTypes.func.isRequired
};

export default pure(Formula);
