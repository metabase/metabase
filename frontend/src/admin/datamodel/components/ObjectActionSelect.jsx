import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.jsx";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.jsx";
import ModalWithTrigger from "metabase/components/ModalWithTrigger.jsx";

import ObjectRetireModal from "./ObjectRetireModal.jsx";

import { capitalize } from "metabase/lib/formatting";

export default class ObjectActionsSelect extends Component {
    static propTypes = {
        object: PropTypes.object.isRequired,
        objectType: PropTypes.string.isRequired,
        onRetire: PropTypes.func.isRequired
    };

    async onRetire(object) {
        await this.props.onRetire(object);
        this.refs.retireModal.close();
    }

    render() {
        const { object, objectType } = this.props;
        return (
            <div>
                <PopoverWithTrigger
                    ref="popover"
                    triggerElement={<span className="text-grey-1 text-grey-4-hover"><Icon name={'ellipsis'}></Icon></span>}
                >
                    <ul className="UserActionsSelect">
                        <li>
                            <a href={"/admin/datamodel/" + objectType + "/" + object.id} className="py1 px2 block bg-brand-hover text-white-hover no-decoration cursor-pointer">
                                Edit {capitalize(objectType)}
                            </a>
                        </li>
                        <li>
                            <a href={"/admin/datamodel/" + objectType + "/" + object.id + "/revisions"} className="py1 px2 block bg-brand-hover text-white-hover no-decoration cursor-pointer">
                                Revision History
                            </a>
                        </li>
                        <li className="mt1 border-top">
                            <ModalWithTrigger
                                ref="retireModal"
                                triggerElement={"Retire " + capitalize(objectType)}
                                triggerClasses="block p2 bg-error-hover text-error text-white-hover cursor-pointer"
                            >
                                <ObjectRetireModal
                                    object={object}
                                    objectType={objectType}
                                    onRetire={this.onRetire.bind(this)}
                                    onClose={() => this.refs.retireModal.close()}
                                />
                            </ModalWithTrigger>
                        </li>
                    </ul>
                </PopoverWithTrigger>
            </div>
        );
    }
}
