/* @flow */

import React from "react";

import StructuredQuery from "metabase-lib/lib/queries/StructuredQuery";
import { t } from 'c-3po';
import type {
    ClickAction,
    ClickActionProps
} from "metabase/meta/types/Visualization";

export default ({ question }: ClickActionProps): ClickAction[] => {
    const query = question.query();
    if (!(query instanceof StructuredQuery) || query.isBareRows()) {
        return [];
    }
    const dname = <span className="text-dark">{query.table().display_name}</span>
    return [
        {
            name: "underlying-records",
            title: (
                <span>
                    {t`View the underlying ${ dname } records`}
                </span>
            ),
            icon: "table2",
            question: () => question.toUnderlyingRecords()
        }
    ];
};
