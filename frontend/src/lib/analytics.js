/*global ga*/

import MetabaseSettings from "metabase/lib/settings";


// Simple module for in-app analytics.  Currently sends data to GA but could be extended to anything else.
const MetabaseAnalytics = {
    // track a pageview (a.k.a. route change)
    trackPageView: function(url) {
        if (url) {
            // scrub query builder urls to remove serialized json queries from path
            url = (url.lastIndexOf('/q/', 0) === 0) ? '/q/' : url;

            const { tag } = MetabaseSettings.get('version');

            ga('set', 'dimension1', tag);
            ga('set', 'page', url);
            ga('send', 'pageview', url);
        }
    },

    // track an event
    trackEvent: function(category, action, label, value) {
        const { tag } = MetabaseSettings.get('version');

        // category & action are required, rest are optional
        if (category && action) {
            ga('set', 'dimension1', tag);
            ga('send', 'event', category, action, label, value);
        }
    }
}

export default MetabaseAnalytics;


export function registerAnalyticsClickListener() {
    document.body.addEventListener("click", function(e) {
        var node = e.target;

        // check the target and all parent elements
        while (node) {
            if (node.dataset && node.dataset.metabaseEvent) {
                // we expect our event to be a semicolon delimited string
                const parts = node.dataset.metabaseEvent.split(";").map(p => p.trim());
                MetabaseAnalytics.trackEvent(...parts);
            }
            node = node.parentNode;
        }
    }, true);
}
