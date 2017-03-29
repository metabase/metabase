/* @flow weak */

import React from "react";

import NativeQueryEditor
    from "metabase/query_builder/components/NativeQueryEditor";
import RunButton from "metabase/query_builder/components/RunButton";
import QueryResult from "../QueryResult";

import cx from "classnames";

const NativeLayout = (
    {
        className,
        sidebarElement,
        parametersElement,
        footerElement,
        resultElement,
        ...props
    }
) => {
    const {
        isRunning,
        isRunnable,
        isResultDirty,
        runQueryFn,
        cancelQueryFn
    } = props;
    return (
        <div className={cx(className, "flex flex-column mt2")}>
            <NativeQueryEditor {...props} />
            <div className="flex layout-centered my2">
                <RunButton
                    isRunnable={isRunnable}
                    isDirty={isResultDirty}
                    isRunning={isRunning}
                    onRun={runQueryFn}
                    onCancel={cancelQueryFn}
                />
            </div>
            <QueryResult {...props} className="flex-full" />
        </div>
    );
};

export default {
    name: "native",

    ModeLayout: NativeLayout
};
