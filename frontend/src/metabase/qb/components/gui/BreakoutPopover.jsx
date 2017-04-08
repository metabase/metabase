/* @flow */

import React from "react";

import FieldList from "metabase/query_builder/components/FieldList.jsx";

import type { Breakout, ExpressionName } from "metabase/meta/types/Query";
import type { TableMetadata, FieldOptions } from "metabase/meta/types/Metadata";

type Props = {
    breakout?: Breakout,
    tableMetadata: TableMetadata,
    fieldOptions: FieldOptions,
    customFieldOptions: { [key: ExpressionName]: any },
    onCommitBreakout: (breakout: Breakout) => void,
    onClose?: () => void
};

const BreakoutPopover = (
    {
        breakout,
        tableMetadata,
        fieldOptions,
        customFieldOptions,
        onCommitBreakout,
        onClose
    }: Props
) => (
    <FieldList
        className="text-green"
        tableMetadata={tableMetadata}
        field={breakout}
        fieldOptions={fieldOptions}
        customFieldOptions={customFieldOptions}
        onFieldChange={field => {
            onCommitBreakout(field);
            if (onClose) {
                onClose();
            }
        }}
        enableTimeGrouping
        alwaysExpanded
    />
);

export default BreakoutPopover;
