import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.jsx";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.jsx";

export default class UserActionsSelect extends Component {

    static propTypes = {
        segment: PropTypes.object.isRequired
    };

    onRemove() {

    }

    render() {
        let { segment } = this.props;

        return (
            <PopoverWithTrigger
                ref="popover"
                className="block"
                triggerElement={<span className="text-grey-1 text-grey-4-hover"><Icon name={'ellipsis'}></Icon></span>}
            >
                <ul className="UserActionsSelect">
                    <li>
                        <a href={"/admin/datamodel/segment/"+segment.id} className="py1 px2 block bg-brand-hover text-white-hover no-decoration cursor-pointer">
                            Edit Segment
                        </a>
                    </li>
                    <li>
                        <a href={"/admin/datamodel/segment/"+segment.id+"/revisions"} className="py1 px2 block bg-brand-hover text-white-hover no-decoration cursor-pointer">
                            Revision History
                        </a>
                    </li>
                    <li className="mt1 p2 border-top bg-error-hover text-error text-white-hover cursor-pointer"  onClick={this.onRemove.bind(this)}>
                        Retire Segment
                    </li>
                </ul>
            </PopoverWithTrigger>
        );
    }
}
