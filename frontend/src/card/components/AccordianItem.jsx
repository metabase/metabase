import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.jsx";

export default class AccordianItem extends Component {
    static propTypes = {
        onClickFn: PropTypes.func.isRequired,
        itemId: PropTypes.number.isRequired,
        isOpen: PropTypes.bool.isRequired,
        title: PropTypes.string.isRequired,
        children: PropTypes.element.isRequired
    }

    render() {
        let { children, onClickFn, isOpen, itemId, title } = this.props;

        return (
            <div key={itemId}>
                <div className="p2 text-grey-4 text-brand-hover border-bottom" onClick={() => (onClickFn(itemId))}>
                    <span className="float-left">{title}</span>
                    <div className="text-right text-grey-2 text-brand-hover">
                        { isOpen ?
                            <Icon name="chevronup" width={12} height={12}></Icon>
                        :
                            <Icon name="chevrondown" width={12} height={12}></Icon>
                        }
                    </div>
                </div>
                { isOpen ?
                    <div className="pt1">
                        <div className="article">
                            {children}
                        </div>
                    </div>
                : null }
            </div>
        );
    }
}
