// provides functions for building urls to things we care about
var Urls = {
    card: function(card_id) {
        // NOTE that this is for an ephemeral card link, not an editable card
        return "/card/"+card_id+"?clone";
    },

    dashboard: function(dashboard_id) {
        return "/dash/"+dashboard_id;
    },

    modelToUrl: function(model, model_id) {
        switch (model) {
            case "card":      return Urls.card(model_id);
            case "dashboard": return Urls.dashboard(model_id);
            default:          return null;
        }
    },

    tableRowsQuery: function(database_id, table_id) {
        return "/q/?db="+database_id+"&table="+table_id;
    }
}

export default Urls;
