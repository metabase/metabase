/* eslint-disable flowtype/require-valid-file-annotation */

import type {
    ClickAction,
    ClickActionProps
} from "metabase/meta/types/Visualization";

import { isSegmentFilter } from "metabase/lib/query/filter";

export default ({ question }: ClickActionProps): ClickAction[] => {
    if (question.card().id) {
        return question
            .query()
            .filters()
            .filter(filter => isSegmentFilter(filter))
            .map(filter => {
                const id = filter[1];
                const segment = question.metadata().segments[id];
                return {
                    name: "xray-segment",
                    title: `XRay ${segment && segment.name}`,
                    icon: "beaker",
                    url: () => `/xray/segment/${id}/approximate`
                };
            });
    } else {
        return [];
    }
};
