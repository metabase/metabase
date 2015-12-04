import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.jsx";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.jsx";

export default class UserActionsSelect extends Component {

    static propTypes = {
        aggregation: PropTypes.object.isRequired
    };

    onRemoveAggregation() {

    }

    render() {
        let { aggregation } = this.props;

        return (
            <PopoverWithTrigger
                ref="popover"
                className="block"
                triggerElement={<span className="text-grey-1 text-grey-4-hover"><Icon name={'ellipsis'}></Icon></span>}
            >
                <ul className="UserActionsSelect">
                    <li>
                        <a href={"/admin/datamodel/aggregation/"+aggregation.id} className="py1 px2 block bg-brand-hover text-white-hover no-decoration cursor-pointer">
                            Edit Aggregation
                        </a>
                    </li>
                    <li>
                        <a href={"/admin/datamodel/aggregation/"+aggregation.id+"/revisions"} className="py1 px2 block bg-brand-hover text-white-hover no-decoration cursor-pointer">
                            Revision History
                        </a>
                    </li>
                    <li className="mt1 p2 border-top bg-error-hover text-error text-white-hover cursor-pointer"  onClick={this.onRemoveAggregation.bind(this)}>
                        Remove Aggregation
                    </li>
                </ul>
            </PopoverWithTrigger>
        );
    }
}
