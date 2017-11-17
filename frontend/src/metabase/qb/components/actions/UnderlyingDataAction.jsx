/* @flow */

import type {
    ClickAction,
    ClickActionProps
} from "metabase/meta/types/Visualization";

export default ({ question }: ClickActionProps): ClickAction[] => {
    if (question.display() !== "table" && question.display() !== "scalar") {
        return [
            {
                name: "underlying-data",
                title: "View this as a table",
                icon: "table",
                question: () => question.toUnderlyingData()
            }
        ];
    }
    return [];
};
