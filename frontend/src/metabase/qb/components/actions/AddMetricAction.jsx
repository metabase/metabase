/* @flow */

import type {
    ClickAction,
    ClickActionProps
} from "metabase/meta/types/Visualization";

export default ({ question }: ClickActionProps): ClickAction[] => {
    if (question.canConvertToMultiQuery()) {
        return [
            {
                name: "add-metric",
                title: "Add a metric",
                icon: "add",
                question: () => question.newQuestion().convertToMultiQuery()
            }
        ];
    }
    return [];
};
