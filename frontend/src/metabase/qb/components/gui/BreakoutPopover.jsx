/* @flow weak */

import React, { Component, PropTypes } from "react";

import FieldList from "metabase/query_builder/components/FieldList.jsx";

type Props = {};

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
            onClose();
        }}
        enableTimeGrouping
        alwaysExpanded
    />
);

export default BreakoutPopover;
