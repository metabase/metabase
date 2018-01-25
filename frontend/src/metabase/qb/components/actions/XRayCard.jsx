/* @flow */

import type {
    ClickAction,
    ClickActionProps
} from "metabase/meta/types/Visualization";
import { t } from "c-3po";

export default ({ question, settings }: ClickActionProps): ClickAction[] => {
    // currently time series xrays require the maximum fidelity
    if (
        settings["enable_xrays"] &&
        settings["xray_max_cost"] === "extended"
    ) {
        const cardId = question.card().id
        const isSavedQuestion = !!cardId

        const url = () =>
            isSavedQuestion ? `/xray/card/${cardId}/extended` : `/xray/card/extended#` + question.getUrlHash()

        return [
            {
                name: "xray-card",
                title: t`X-ray this question`,
                icon: "beaker",
                url
            }
        ];
    } else {
        return [];
    }
};
