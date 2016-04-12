import React, { Component, PropTypes } from "react";
import _ from "underscore";

import Icon from "metabase/components/Icon.jsx";
import IconBorder from "metabase/components/IconBorder.jsx";


export default class Expressions extends Component {

    static propTypes = {
        expressions: PropTypes.object,
        onAddExpression: PropTypes.func.isRequired,
        onEditExpression: PropTypes.func.isRequired
    };

    static defaultProps = {
        expressions: {}
    };

    render() {
        const { expressions, onAddExpression, onEditExpression } = this.props;

        let sortedNames = _.sortBy(_.keys(expressions), _.identity);
        return (
            <div className="py2 border-bottom">
                <div className="Query-label">Custom fields</div>

                { sortedNames && sortedNames.map(name =>
                    <div key={name} className="pt1 text-brand text-bold cursor-pointer" onClick={() => onEditExpression(name)}>{name}</div>
                )}

                <a className="mt2 text-grey-2 text-bold flex align-center text-grey-4-hover cursor-pointer no-decoration transition-color" onClick={() => onAddExpression()}>
                    <IconBorder borderRadius="3px">
                        <Icon name="add" width="14px" height="14px" />
                    </IconBorder>
                    <span className="ml1">Add a <span className="text-grey-4">custom</span> field</span>
                </a>
            </div>
        );
    }
}
