'use strict';
/*global ga*/

// Simple module for in-app analytics.  Currently sends data to GA but could be extended to anything else.
var MetabaseAnalytics = {
    // track a pageview (a.k.a. route change)
    trackPageView: function(url) {
        if (url) {
            // scrub query builder urls to remove serialized json queries from path
            url = (url.lastIndexOf('/q/', 0) === 0) ? '/q/' : url;

            ga('set', 'page', url);
            ga('send', 'pageview', url);
        }
    },

    // track an event
    trackEvent: function(category, action, label, value) {
        // category & action are required, rest are optional
        if (category && action) {
            ga('send', 'event', category, action, label, value);
        }
    }
}

export default MetabaseAnalytics;
