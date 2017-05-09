import { serializeCardForUrl } from "metabase/lib/card";

// provides functions for building urls to things we care about

export function question(cardId, hash = "", query = "") {
    if (hash && typeof hash === "object") {
        hash = serializeCardForUrl(hash);
    }
    if (query && typeof query === "object") {
        query = Object.entries(query)
            .map(kv => kv.map(encodeURIComponent).join("="))
            .join("&");
    }
    if (hash && hash.charAt(0) !== "#") {
        hash = "#" + hash;
    }
    if (query && query.charAt(0) !== "?") {
        query = "?" + query;
    }
    // NOTE that this is for an ephemeral card link, not an editable card
    return cardId != null
        ? `/question/${cardId}${query}${hash}`
        : `/question${query}${hash}`;
}

export function dashboard(dashboardId, {addCardWithId} = {}) {
    return addCardWithId != null
        ? `/dashboard/${dashboardId}#add=${addCardWithId}`
        : `/dashboard/${dashboardId}`;
}

export function modelToUrl(model, modelId) {
    switch (model) {
        case "card":
            return question(modelId);
        case "dashboard":
            return dashboard(modelId);
        case "pulse":
            return pulse(modelId);
        default:
            return null;
    }
}

export function pulse(pulseId) {
    return `/pulse/#${pulseId}`;
}

export function tableRowsQuery(databaseId, tableId, metricId, segmentId) {
    let query = `?db=${databaseId}&table=${tableId}`;

    if (metricId) {
        query += `&metric=${metricId}`;
    }

    if (segmentId) {
        query += `&segment=${segmentId}`;
    }

    return question(null, query);
}

export function collection(collection) {
    return `/questions/collections/${encodeURIComponent(collection.slug)}`;
}

export function label(label) {
    return `/questions/search?label=${encodeURIComponent(label.slug)}`;
}

export function publicCard(uuid, type = null) {
    return `/public/question/${uuid}` + (type ? `.${type}` : ``);
}

export function publicDashboard(uuid) {
    return `/public/dashboard/${uuid}`;
}

export function embedCard(token, type = null) {
    return `/embed/question/${token}` + (type ? `.${type}` : ``);
}
