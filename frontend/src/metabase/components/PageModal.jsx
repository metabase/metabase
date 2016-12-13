import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.jsx";

import cx from "classnames";

export default class PageModal extends Component {
    render () {
        const { children, onClose, title, className, footer } = this.props;
        return (
            <div className={cx(className || "flex-full", "flex flex-column")}>
                <div className="p4 flex align-center flex-no-shrink">
                    <h1 className="ml-auto text-bold">{title}</h1>
                    <div className="ml-auto">
                    {onClose &&
                        <Icon
                            className="text-grey-2 text-grey-4-hover cursor-pointer"
                            name="close"
                            width="36"
                            height="36"
                            onClick={onClose}
                        />
                    }
                    </div>
                </div>
                { children }
                <div className="flex-full" />
                { footer &&
                    <div className="flex-no-shrink border-top p4 flex">
                        <div className="ml-auto">
                            {footer}
                        </div>
                    </div>
                }
            </div>
        )
    }
}
