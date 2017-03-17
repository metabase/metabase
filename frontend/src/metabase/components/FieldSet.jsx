import React, {Component, PropTypes} from "react";

import cx from "classnames";

type Props = {
    className: string,
    legend: string,
    noPadding?: boolean,
    children: ReactElement
}

export default function FieldSet({className = "border-brand", legend, noPadding, children}: Props) {
    const fieldSetClassName = cx("bordered rounded", {"px2": !noPadding}, {"pb2": !noPadding});
    const missingLegendMargin = legend ? {} : {marginTop: "0.415em"};

    return (
        <fieldset className={cx(className, fieldSetClassName)} style={missingLegendMargin}>
            {legend &&
            <legend className="h5 text-bold text-uppercase px1" style={{ marginLeft: "-0.5rem" }}>{legend}</legend>}
            <div style={missingLegendMargin}>
                {children}
            </div>
        </fieldset>
    );
}
