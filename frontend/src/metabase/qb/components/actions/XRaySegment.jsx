/* @flow */
/*
 * NOTE(@kdoh) 8/5/2017 - Disabling this file until we add Card XRay support
 * import type {
    ClickAction,
    ClickActionProps
} from "metabase/meta/types/Visualization";

export default ({ card, tableMetadata }: ClickActionProps): ClickAction[] => {
    console.log(card);
    if (card.id) {
        return [
            {
                name: "underlying-data",
                title: "XRay this Card",
                icon: "table",
                url: () => {
                    return "/xray/card/" + card.id;
                }
            }
        ];
    } else {
        return [];
    }
};
*/
