/* @flow weak */

import _ from "underscore";
import { updateIn, setIn } from "icepick";

import { createSelector } from 'reselect';

import * as Dashboard from "metabase/meta/Dashboard";
import Metadata from "metabase/meta/metadata/Metadata";

import type { CardObject } from "metabase/meta/types/Card";
import type { ParameterMappingOption, ParameterObject, ParameterMappingObject } from "metabase/meta/types/Dashboard";

export const getDashboardId       = state => state.dashboard.dashboardId;
export const getIsEditing         = state => state.dashboard.isEditing;
export const getCards             = state => state.dashboard.cards;
export const getDashboards        = state => state.dashboard.dashboards;
export const getDashcards         = state => state.dashboard.dashcards;
export const getCardData          = state => state.dashboard.dashcardData;
export const getCardDurations     = state => state.dashboard.cardDurations;
export const getCardIdList        = state => state.dashboard.cardList;
export const getRevisions         = state => state.dashboard.revisions;
export const getParameterValues   = state => state.dashboard.parameterValues;

export const getDatabases         = state => state.metadata.databases;

export const getMetadata = createSelector(
    [state => state.metadata],
    (metadata) => Metadata.fromEntities(metadata)
)

export const getDashboard = createSelector(
    [getDashboardId, getDashboards],
    (dashboardId, dashboards) => dashboards[dashboardId]
);

export const getDashboardComplete = createSelector(
    [getDashboard, getDashcards],
    (dashboard, dashcards) => (dashboard && {
        ...dashboard,
        ordered_cards: dashboard.ordered_cards.map(id => dashcards[id]).filter(dc => !dc.isRemoved)
    })
);

export const getIsDirty = createSelector(
    [getDashboard, getDashcards],
    (dashboard, dashcards) => !!(
        dashboard && (
            dashboard.isDirty ||
            _.some(dashboard.ordered_cards, id => (
                !(dashcards[id].isAdded && dashcards[id].isRemoved) &&
                (dashcards[id].isDirty || dashcards[id].isAdded || dashcards[id].isRemoved)
            ))
        )
    )
);

export const getCardList = createSelector(
    [getCardIdList, getCards],
    (cardIdList, cards) => cardIdList && cardIdList.map(id => cards[id])
);

export const getEditingParameterId = (state) => state.dashboard.editingParameterId;

export const getEditingParameter = createSelector(
    [getDashboard, getEditingParameterId],
    (dashboard, editingParameterId) => editingParameterId != null ? _.findWhere(dashboard.parameters, { id: editingParameterId }) : null
);

export const getIsEditingParameter = (state) => state.dashboard.editingParameterId != null;

const getCard = (state, props) => props.card;
const getDashCard = (state, props) => props.dashcard;

export const getParameterTarget = createSelector(
    [getEditingParameter, getCard, getDashCard],
    (parameter, card, dashcard) => {
        const mapping = _.findWhere(dashcard.parameter_mappings, { card_id: card.id, parameter_id: parameter.id });
        return mapping && mapping.target;
    }
);

export const getMappingsByParameter = createSelector(
    [getMetadata, getDashboardComplete],
    (metadata, dashboard) => {
        if (!dashboard) {
            return {};
        }

        let mappingsByParameter = {};
        let countsByParameter = {};
        let mappings = [];
        for (const dashcard of dashboard.ordered_cards) {
            const cards: Array<CardObject> = [dashcard.card].concat(dashcard.series);
            for (let mapping: ParameterMappingObject of (dashcard.parameter_mappings || [])) {
                let card = _.findWhere(cards, { id: mapping.card_id });
                let field = Dashboard.getParameterMappingTargetField(metadata, card, mapping.target);
                let values = field && field.values() || [];
                for (const value of values) {
                    countsByParameter = updateIn(countsByParameter, [mapping.parameter_id, value], (count = 0) => count + 1)
                }
                mapping = {
                    ...mapping,
                    parameter_id: mapping.parameter_id,
                    dashcard_id: dashcard.id,
                    card_id: mapping.card_id,
                    values
                };
                mappingsByParameter = setIn(mappingsByParameter, [mapping.parameter_id, dashcard.id, mapping.card_id], mapping);
                mappings.push(mapping);
            }
        }
        let mappingsWithValuesByParameter = {};
        // update max values overlap for each mapping
        for (let mapping of mappings) {
            if (mapping.values && mapping.values.length > 0) {
                let overlapMax = Math.max(...mapping.values.map(value => countsByParameter[mapping.parameter_id][value]))
                mappingsByParameter = setIn(mappingsByParameter, [mapping.parameter_id, mapping.dashcard_id, mapping.card_id, "overlapMax"], overlapMax);
                mappingsWithValuesByParameter = updateIn(mappingsWithValuesByParameter, [mapping.parameter_id], (count = 0) => count + 1);
            }
        }
        // update count of mappings with values
        for (let mapping of mappings) {
            mappingsByParameter = setIn(mappingsByParameter, [mapping.parameter_id, mapping.dashcard_id, mapping.card_id, "mappingsWithValues"], mappingsWithValuesByParameter[mapping.parameter_id] || 0);
        }

        return mappingsByParameter;
    }
);

export const makeGetParameterMappingOptions = () => {
    const getParameterMappingOptions = createSelector(
        [getMetadata, getEditingParameter, getCard],
        (metadata, parameter: ParameterObject, card: CardObject): Array<ParameterMappingOption> => {
            return Dashboard.getParameterMappingOptions(metadata, parameter, card);
        }
    );
    return getParameterMappingOptions;
}
