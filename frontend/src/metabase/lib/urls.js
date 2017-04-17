import { serializeCardForUrl } from "metabase/lib/card";

// provides functions for building urls to things we care about

export function question(cardId, cardOrHash = "") {
    if (cardOrHash && typeof cardOrHash === "object") {
        cardOrHash = serializeCardForUrl(cardOrHash);
    }
    if (cardOrHash && cardOrHash.charAt(0) !== "#") {
        cardOrHash = "#" + cardOrHash;
    }
    // NOTE that this is for an ephemeral card link, not an editable card
    return cardId != null
        ? `/question/${cardId}${cardOrHash}`
        : `/question${cardOrHash}`;
}

export function dashboard(dashboardId) {
    return `/dashboard/${dashboardId}`;
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
