import React, {Component, PropTypes} from "react";

import cx from "classnames";

type Props = {
    className: string,
    legend: string,
    noPadding?: boolean,
    children: ReactElement
}

export default function FieldSet({className = "border-brand", legend, noPadding, children}: Props) {
    const fieldSetClassName = cx("bordered rounded", {"px2 pb2": !noPadding});

    return (
        <fieldset className={cx(className, fieldSetClassName)}>
            {legend &&
            <legend className="h5 text-bold text-uppercase px1 text-nowrap text-grey-4" style={{ height: 0, lineHeight: 0, marginLeft: "-0.5rem" }}>{legend}</legend>}
            <div>
                {children}
            </div>
        </fieldset>
    );
}
