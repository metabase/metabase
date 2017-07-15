/* @flow */

import React from "react";

import FieldList from "metabase/query_builder/components/FieldList.jsx";

import type { Breakout } from "metabase/meta/types/Query";
import type { TableMetadata, FieldOptions } from "metabase/meta/types/Metadata";

type Props = {
    breakout?: Breakout,
    tableMetadata: TableMetadata,
    fieldOptions: FieldOptions,
    onCommitBreakout: (breakout: Breakout) => void,
    onClose?: () => void
};

const BreakoutPopover = (
    {
        breakout,
        tableMetadata,
        fieldOptions,
        onCommitBreakout,
        onClose
    }: Props
) => (
    <FieldList
        className="text-green"
        tableMetadata={tableMetadata}
        field={breakout}
        fieldOptions={fieldOptions}
        onFieldChange={field => {
            onCommitBreakout(field);
            if (onClose) {
                onClose();
            }
        }}
        enableSubDimensions
        alwaysExpanded
    />
);

export default BreakoutPopover;
