import React, { Component } from "react";
import cx from "classnames";
import { connect } from "react-redux";

import ReactCSSTransitionGroup from "react-addons-css-transition-group";

import S from "./Formula.css";

import Icon from "metabase/components/Icon.jsx";

import QueryDefinition from "metabase/query_builder/components/dataref/QueryDefinition.jsx";
import { fetchTableMetadata } from "metabase/redux/metadata";
import { getMetadata } from "metabase/selectors/metadata";

import type Metadata from "metabase-lib/lib/metadata/Metadata";

const mapDispatchToProps = {
    fetchTableMetadata,
};

const mapStateToProps = (state, props) => ({
    metadata: getMetadata(state, props)
})

@connect(mapStateToProps, mapDispatchToProps)
export default class Formula extends Component {
    props: {
        type: string,
        entity: Object,
        isExpanded: boolean,
        expandFormula: any,
        collapseFormula: any,
        metadata: Metadata
    }

    render() {
        const { type, entity, isExpanded, expandFormula, collapseFormula, metadata } = this.props;

        return (
            <div
                className={cx(S.formula)}
                onClick={isExpanded ? collapseFormula : expandFormula}
            >
                <div className={S.formulaHeader}>
                    <Icon name="beaker" size={24}/>
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
                            tableMetadata={metadata.tables[entity.table_id]}
                        />
                    </div>
                    }
                </ReactCSSTransitionGroup>
            </div>
        )
    }
}
