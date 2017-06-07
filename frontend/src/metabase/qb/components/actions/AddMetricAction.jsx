/* @flow */
import StructuredQuery from "metabase-lib/lib/StructuredQuery";

import type {
    ClickAction,
    ClickActionProps
} from "metabase/meta/types/Visualization";

export default ({ question }: ClickActionProps): ClickAction[] => {
    const isBareRows = question.query() instanceof StructuredQuery && question.query().isBareRows()

    if (question.canConvertToMultiQuery()) {
        return [
            {
                name: "add-metric",
                title: "Add a metric",
                icon: "add",
                question: () => question.convertToMultiQuery()
            }
        ];
    }
    return [];
};
