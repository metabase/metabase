// provides functions for building urls to things we care about
var Urls = {
    card: function(cardId) {
        // NOTE that this is for an ephemeral card link, not an editable card
        return `/question/${cardId}`;
    },

    dashboard: function(dashboardId) {
        return `/dashboard/${dashboardId}`;
    },

    modelToUrl: function(model, modelId) {
        switch (model) {
            case "card":      return Urls.card(modelId);
            case "dashboard": return Urls.dashboard(modelId);
            case "pulse":     return Urls.pulse(modelId);
            default:          return null;
        }
    },

    pulse: function(pulseId) {
        return `/pulse/#${pulseId}`;
    },

    tableRowsQuery: function(databaseId, tableId, metricId, segmentId) {
        let url = `/q#?db=${databaseId}&table=${tableId}`;

        if (metricId) {
            url += `&metric=${metricId}`;
        }

        if (segmentId) {
            url += `&segment=${segmentId}`;
        }

        return url;
    },

    collection(collection) {
        return `/questions/collections/${encodeURIComponent(collection.slug)}`;
    },

    label(label) {
        return `/questions/search?label=${encodeURIComponent(label.slug)}`;
    },

    publicCard(uuid, type = null) {
        return `/public/question/${uuid}` + (type ? `.${type}` : ``);
    },

    publicDashboard(uuid) {
        return `/public/dashboard/${uuid}`;
    },

    embedCard(token, type = null) {
        return `/embed/question/${token}` + (type ? `.${type}` : ``);
    },
}

export default Urls;
